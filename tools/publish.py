#!/usr/bin/env python3
"""앱 폴더를 업데이트 저장소 구조(app/ + manifest.json)로 내보낸다.
사용: python3 publish.py <앱폴더> <저장소폴더> [업데이트 메모]"""
import hashlib, json, os, shutil, sys

src, repo = sys.argv[1], sys.argv[2]
notes = sys.argv[3] if len(sys.argv) > 3 else ''
version = json.load(open(os.path.join(src, 'package.json'), encoding='utf-8'))['version']

dest = os.path.join(repo, 'app')
shutil.rmtree(dest, ignore_errors=True)
shutil.copytree(src, dest)

files = []
for root, _, names in os.walk(dest):
    for n in sorted(names):
        full = os.path.join(root, n)
        rel = os.path.relpath(full, dest).replace(os.sep, '/')
        data = open(full, 'rb').read()
        files.append({'path': rel, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)})
files.sort(key=lambda f: f['path'])

json.dump({'version': version, 'notes': notes, 'files': files},
          open(os.path.join(repo, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'v{version} · {len(files)} files · {sum(f["size"] for f in files)/1024:.0f} KB')
