# Run by manual-kit with LibreOffice's Python (it has the "uno" module):
#   python finalize.py <soffice> <in.docx> <out.docx> <out.pdf> <profile dir>
# Starts a private headless soffice, opens the DOCX hidden, updates every index (contents, figure and table lists)
# and field after laying the document out, saves it as DOCX and exports a PDF of that layout, then shuts soffice down.
# Prints "indexes=<n>" on success; exits non-zero with a one-line reason otherwise.
import os
import subprocess
import sys
import time

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def connect(resolver, url, proc, seconds=60):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            return resolver.resolve(url)
        except Exception:
            if proc.poll() is not None:
                raise SystemExit("soffice exited early (code %s)" % proc.returncode)
            time.sleep(0.25)
    raise SystemExit("could not connect to soffice within %d s" % seconds)


def main(soffice, src, out, pdf, profile):
    pipe = "manualkit%d" % os.getpid()
    url = "uno:pipe,name=%s;urp;StarOffice.ComponentContext" % pipe
    proc = subprocess.Popen(
        [
            soffice,
            "--headless",
            "--invisible",
            "--nologo",
            "--norestore",
            "--nodefault",
            "--nolockcheck",
            "-env:UserInstallation=" + uno.systemPathToFileUrl(os.path.abspath(profile)),
            "--accept=pipe,name=%s;urp;StarOffice.ComponentContext" % pipe,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    desktop = None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = connect(resolver, url, proc)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), "_blank", 0, (prop("Hidden", True),))
        if doc is None:
            raise SystemExit("LibreOffice could not open the DOCX")
        try:
            indexes = doc.getDocumentIndexes()
            # twice: filling the lists can move later headings to another page
            for _ in range(2):
                doc.refresh()
                for i in range(indexes.getCount()):
                    indexes.getByIndex(i).update()
                doc.getTextFields().refresh()
            doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(out)), (prop("FilterName", "MS Word 2007 XML"),))
            doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(pdf)), (prop("FilterName", "writer_pdf_Export"),))
            print("indexes=%d" % indexes.getCount())
        finally:
            doc.close(True)
    finally:
        if desktop is not None:
            try:
                desktop.terminate()
            except Exception:
                pass  # the bridge closes as soffice exits
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit("usage: finalize.py <soffice> <in.docx> <out.docx> <out.pdf> <profile dir>")
    main(*sys.argv[1:])
