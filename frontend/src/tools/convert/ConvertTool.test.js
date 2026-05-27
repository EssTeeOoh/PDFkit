import { fireEvent, screen, waitFor } from "@testing-library/react";
import ConvertTool from "./ConvertTool";
import { makePdfFile, renderWithProviders } from "../../testUtils";
import { post } from "../../utils/http";

jest.mock("../../utils/http", () => ({
  __esModule: true,
  post: jest.fn(),
}));

jest.mock("../../utils/haptics", () => ({
  hapticTap: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

jest.mock("../../utils/telemetry", () => ({
  reportFrontendError: jest.fn(),
  trackToolAction: jest.fn(),
}));

describe("ConvertTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits a PDF to the pdf-to-word endpoint", async () => {
    post.mockResolvedValue({
      data: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      headers: { "content-disposition": 'attachment; filename="converted.docx"' },
    });

    const { container } = renderWithProviders(<ConvertTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("contract.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /convert to docx/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "http://localhost:8000/api/pdf-to-word",
        expect.any(FormData),
        expect.objectContaining({ responseType: "blob" })
      )
    );

    expect((await screen.findAllByText(/converted successfully/i)).length).toBeGreaterThan(0);
  });
});
