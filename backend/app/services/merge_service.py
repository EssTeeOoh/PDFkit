from pypdf import PdfWriter, PdfReader


def merge_pdfs(input_paths: list[str], output_path: str):
    """Merge a list of PDF files into a single output PDF."""
    writer = PdfWriter()

    for path in input_paths:
        reader = PdfReader(path)
        for page in reader.pages:
            writer.add_page(page)

    with open(output_path, "wb") as out:
        writer.write(out)