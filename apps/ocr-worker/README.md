# MiniCoze OCR Worker (independent from Backend and Agent)

## Environment

The independent Windows environment used for this experiment is
`C:\Users\27968\AppData\Local\Temp\minicoze-paddleocr-py312`.
The precise requirements are documented in `requirements.txt`; this directory
does not add dependencies to the Agent environment. Python 3.12.10 and the
installed wheels were checked locally. No installer runs at Worker startup.

Configure `OCR_MODEL_DIR` to the parent directory containing
`PP-OCRv5_mobile_det` and `PP-OCRv5_mobile_rec`. By default it is
`~/.paddlex/official_models`. Each model must already have nonempty
`inference.json`, `inference.yml`, and `inference.pdiparams` files. Startup
fails before importing PaddleOCR if any file is missing. Model initialization
itself is a separate runtime step; verify network behavior in the deployment
environment before treating startup as offline certified.

Configure a nonempty `OCR_WORKER_TOKEN` before starting. Bind to loopback or
another private interface; do not expose the OCR endpoint publicly. For a
PowerShell session with these variables configured:

`PDF_MAX_BYTES` defaults to 67108864 bytes (64 MiB); configure the same value
for Backend and Worker when overriding it. `OCR_IMAGE_MAX_BYTES` defaults to
10485760 bytes (10 MiB) and is independent. Restart the Worker after changing
either variable; this service does not read the Backend's `.env` automatically.

```powershell
Set-Location 'C:\Users\27968\Documents\ChatGPT\MiniCoze\mini-coze-group-1-pdf\apps\ocr-worker'
& 'C:\Users\27968\AppData\Local\Temp\minicoze-paddleocr-py312\Scripts\python.exe' -B -m uvicorn ocr_worker.main:app --host 127.0.0.1 --port 8001 --workers 1
```

One process initializes the two Mobile models once on startup. `/health`
reports HTTP server health; `/ready` reports model readiness and initialization
time. Model loading errors prevent startup. Run only one Uvicorn worker: every
additional process would initialize an independent model and concurrency gate.

## Internal API

Both POST routes require `Authorization: Bearer <OCR_WORKER_TOKEN>` and one
multipart `file` field. PDF uploads default to at most 64 MiB, while image
uploads default to at most 10 MiB. Image uploads accept PNG,
JPEG (`.jpg` or `.jpeg`) and WebP after actual image decoding. For PDF, send
`pageNumbers` as a JSON array encoded in one multipart text field, e.g. `[96]`;
optional `dpi` defaults to 200 (allowed: 72–300). PDF pages are numbered from
**1**, independent of printed page numbers. Repeated/out-of-range pages fail;
the response preserves the requested order. PDF header and parser are checked.

- `POST /internal/ocr/image`
- `POST /internal/ocr/pdf/pages`

Example response (illustrative, not an OCR measurement):

```json
{
  "status": "ok",
  "pages": [{
    "pageNumber": 96,
    "method": "ocr",
    "text": "4. 中文识别",
    "regions": [{"text": "中文识别", "score": 0.97,
      "polygon": [[20, 10], [110, 10], [110, 20], [20, 20]]}],
    "elapsedMs": 13350,
    "renderDpi": 200,
    "width": 1700,
    "height": 2200
  }]
}
```

`pageNumber` is 1 for an uploaded image. PDF responses also include rendered
image dimensions and DPI. The caller must retain the source document ID and
the mapping from PDF page numbers; the Worker does not save uploads or OCR
results. Health endpoints do not require a token; both POST endpoints do.

Status codes: 400 invalid file/page outside the PDF; 401 invalid token; 413
file too large; 422 malformed page list or DPI; 429 capacity or queue wait
exceeded. Unexpected model failures return 500 and require investigation.

Only one OCR task runs at once and one may wait. A third task receives 429;
waiting stops after 30 seconds with 429. **OCR processing has no short fixed
timeout**: multi-page requests may take a long time. Callers must configure
their own long-running request and retry policy. PDF pages are rasterized and
released one at a time; images and pages above 25 million pixels are rejected
as a provisional safety guard requiring real-document review. The OCR model
stays loaded. Reading order supports ordinary single-column pages only; raw
regions remain in the response. Neither table reconstruction nor multi-column
layout is implemented.

## Offline contract tests

```powershell
Set-Location 'C:\Users\27968\Documents\ChatGPT\MiniCoze\mini-coze-group-1-pdf\apps\ocr-worker'
& 'C:\Users\27968\AppData\Local\Temp\minicoze-paddleocr-py312\Scripts\python.exe' -B -m unittest discover -s tests -v
```

Tests use a fake OCR model (no PaddleOCR import or initialization) and a
two-page PDF fixture for real pypdfium2 rendering. Tests do **not** establish
the actual OCR accuracy, actual model initialization, or real Worker memory
consumption. The existing experimental CLI and samples remain untouched.
