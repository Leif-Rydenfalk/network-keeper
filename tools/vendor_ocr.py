#!/usr/bin/env python3
"""Fetch pinned local OCR assets and licenses; no contact photos leave the browser."""
import hashlib, io, json, tarfile, urllib.request
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'app/vendor/ocr'
root.mkdir(parents=True, exist_ok=True)
receipts = []
def put(name, data, source):
    (root / name).write_bytes(data)
    receipts.append(dict(file=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), source=source))
for package, version, files in [
    ('tesseract.js', '6.0.1', {'dist/tesseract.min.js':'tesseract.min.js', 'dist/worker.min.js':'worker.min.js', 'LICENSE.md':'TESSERACT-LICENSE', 'dist/tesseract.min.js.LICENSE.txt':'tesseract.min.js.LICENSE.txt', 'dist/worker.min.js.LICENSE.txt':'worker.min.js.LICENSE.txt'}),
    ('tesseract.js-core','6.0.0', {'tesseract-core-lstm.wasm.js':'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js':'tesseract-core-simd-lstm.wasm.js','LICENSE':'CORE-LICENSE'})]:
    url=f'https://registry.npmjs.org/{package}/-/{package}-{version}.tgz'
    with urllib.request.urlopen(url, timeout=60) as response: data=response.read()
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
        for src,dest in files.items(): put(dest, tar.extractfile('package/'+src).read(),url)
for lang in ['eng','chi_sim','chi_tra']:
    url=f'https://cdn.jsdelivr.net/npm/@tesseract.js-data/{lang}@1.0.0/4.0.0_best_int/{lang}.traineddata.gz'
    with urllib.request.urlopen(url,timeout=60) as response: put(lang+'.traineddata.gz',response.read(),url)
(root/'sources.json').write_text(json.dumps(receipts,indent=2)+'\n')
print('Vendored',len(receipts),'files,',sum(r['bytes'] for r in receipts),'bytes')
