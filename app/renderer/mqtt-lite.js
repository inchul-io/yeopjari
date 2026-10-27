// 아주 작은 MQTT 3.1.1 클라이언트 (WebSocket 전용, QoS 0)
// 외부 라이브러리 없이 동작하도록 직접 구현
(function (global) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function encLen(n) {
    const out = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }
  function str(s) {
    const b = typeof s === 'string' ? enc.encode(s) : s;
    return [b.length >> 8, b.length & 0xff, ...b];
  }
  function packet(head, body) {
    return new Uint8Array([head, ...encLen(body.length), ...body]);
  }

  class MqttLite {
    constructor(opts) {
      this.urls = opts.urls;
      this.clientId = opts.clientId;
      this.will = opts.will || null; // {topic, payload(Uint8Array), retain}
      this.keepalive = opts.keepalive || 45;
      this.onMessage = opts.onMessage || (() => {});
      this.onStatus = opts.onStatus || (() => {});
      this.subs = [];
      this.ws = null;
      this.buf = new Uint8Array(0);
      this.connected = false;
      this.urlIdx = 0;
      this.retry = 0;
      this.closedByUser = false;
      this.pid = 1;
      this.lastRx = 0;
    }

    start() { this.closedByUser = false; this._open(); }

    // 절전 해제·네트워크 변경 후: 기존 연결을 버리고 첫 서버부터 새로 연결
    restart() {
      clearInterval(this.pingTimer);
      clearTimeout(this.retryTimer);
      if (this.ws) { this.ws.onclose = null; this.ws.onmessage = null; try { this.ws.close(); } catch (e) {} }
      this.ws = null;
      const was = this.connected;
      this.connected = false;
      if (was) this.onStatus('disconnected');
      this.closedByUser = false;
      this.urlIdx = 0;
      this.retry = 0;
      this._open();
    }

    stop() {
      this.closedByUser = true;
      clearInterval(this.pingTimer);
      clearTimeout(this.retryTimer);
      try { if (this.ws && this.connected) this.ws.send(new Uint8Array([0xe0, 0])); } catch (e) {}
      try { this.ws && this.ws.close(); } catch (e) {}
      this.connected = false;
    }

    _open() {
      const url = this.urls[this.urlIdx % this.urls.length];
      this.onStatus('connecting', url);
      let ws;
      try { ws = new WebSocket(url, ['mqtt']); } catch (e) { return this._fail(); }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      this.buf = new Uint8Array(0);
      const openTimeout = setTimeout(() => { try { ws.close(); } catch (e) {} }, 8000);
      ws.onopen = () => {
        clearTimeout(openTimeout);
        let flags = 0x02; // clean session
        let payload = [...str(this.clientId)];
        if (this.will) {
          flags |= 0x04;
          if (this.will.retain) flags |= 0x20;
          payload.push(...str(this.will.topic), ...str(this.will.payload));
        }
        const body = [...str('MQTT'), 4, flags, this.keepalive >> 8, this.keepalive & 0xff, ...payload];
        ws.send(packet(0x10, body));
      };
      ws.onmessage = (ev) => { this.lastRx = Date.now(); this._data(new Uint8Array(ev.data)); };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(openTimeout);
        clearInterval(this.pingTimer);
        const was = this.connected;
        this.connected = false;
        if (was) this.onStatus('disconnected');
        if (!this.closedByUser) this._fail(was);
      };
    }

    _fail(wasConnected) {
      if (!wasConnected) this.urlIdx++;
      this.retry = Math.min(this.retry + 1, 6);
      const wait = wasConnected ? 1000 : Math.min(30000, 1000 * Math.pow(2, this.retry));
      this.onStatus('retry', wait);
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this._open(), wait);
    }

    _data(chunk) {
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf); merged.set(chunk, this.buf.length);
      this.buf = merged;
      while (this.buf.length >= 2) {
        let mult = 1, len = 0, i = 1, b;
        do {
          if (i >= this.buf.length) return;
          b = this.buf[i++];
          len += (b & 0x7f) * mult;
          mult *= 128;
        } while (b & 0x80);
        if (this.buf.length < i + len) return;
        const head = this.buf[0];
        const body = this.buf.slice(i, i + len);
        this.buf = this.buf.slice(i + len);
        this._packet(head, body);
      }
    }

    _packet(head, body) {
      const type = head >> 4;
      if (type === 2) { // CONNACK
        if (body[1] !== 0) { this.onStatus('refused', body[1]); try { this.ws.close(); } catch (e) {} return; }
        this.connected = true;
        this.retry = 0;
        this.onStatus('connected', this.urls[this.urlIdx % this.urls.length]);
        this.subs.forEach((t) => this._sendSub(t));
        clearInterval(this.pingTimer);
        this.lastRx = Date.now();
        this.pingTimer = setInterval(() => {
          // 응답이 한참 없으면 죽은 연결로 보고 끊은 뒤 재연결
          if (Date.now() - this.lastRx > 50000) { try { this.ws.close(); } catch (e) {} return; }
          try { this.ws.send(new Uint8Array([0xc0, 0])); } catch (e) {}
        }, 20000);
      } else if (type === 3) { // PUBLISH
        const qos = (head >> 1) & 3;
        const tlen = (body[0] << 8) | body[1];
        const topic = dec.decode(body.slice(2, 2 + tlen));
        let p = 2 + tlen;
        if (qos > 0) {
          const id = [body[p], body[p + 1]];
          p += 2;
          if (qos === 1) this.ws.send(new Uint8Array([0x40, 2, ...id]));
        }
        this.onMessage(topic, body.slice(p), !!(head & 1));
      }
    }

    _sendSub(topic) {
      const id = this.pid++ & 0xffff || 1;
      this.ws.send(packet(0x82, [id >> 8, id & 0xff, ...str(topic), 0]));
    }

    subscribe(topic) {
      this.subs.push(topic);
      if (this.connected) this._sendSub(topic);
    }

    publish(topic, payload, retain) {
      if (!this.connected) return false;
      const data = typeof payload === 'string' ? enc.encode(payload) : payload;
      this.ws.send(packet(0x30 | (retain ? 1 : 0), [...str(topic), ...data]));
      return true;
    }
  }

  global.MqttLite = MqttLite;
})(typeof window !== 'undefined' ? window : globalThis);
