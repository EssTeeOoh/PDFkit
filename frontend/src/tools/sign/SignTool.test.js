import { fireEvent, screen, waitFor } from "@testing-library/react";
import SignTool from "./SignTool";
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

describe("SignTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: jest.fn(() => ({
        promise: Promise.resolve({
          getPage: async () => ({
            getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      })),
    };
  });

  it("uploads a PDF for sign analysis", async () => {
    post.mockResolvedValue({
      data: {
        page_count: 1,
        has_fields: false,
        fields: [],
        page_dimensions: [{ page: 1, width: 612, height: 792 }],
      },
    });

    const { container } = renderWithProviders(<SignTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("sign-me.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /analyze pdf/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "http://localhost:8000/api/sign/analyze",
        expect.any(FormData)
      )
    );

    expect(await screen.findByText(/step 2/i)).toBeInTheDocument();
  });

  it("shows a friendly message for unexpected analysis failures", async () => {
    post.mockRejectedValue(new Error("post is not a function"));

    const { container } = renderWithProviders(<SignTool />);
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, {
      target: { files: [makePdfFile("broken.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /analyze pdf/i }));

    expect(
      await screen.findByText("We couldn't read that PDF. Please try another file or try again.")
    ).toBeInTheDocument();
  });

  it("lets the user upload a photo into the sign canvas", async () => {
    post.mockResolvedValue({
      data: {
        page_count: 1,
        has_fields: false,
        fields: [],
        page_dimensions: [{ page: 1, width: 612, height: 792 }],
      },
    });

    const fileReaderMock = jest.fn(function readAsDataURL() {
      this.result = "data:image/png;base64,photo123";
      this.onload();
    });

    const originalFileReader = window.FileReader;
    window.FileReader = class MockFileReader {
      readAsDataURL = fileReaderMock;
    };

    const { container } = renderWithProviders(<SignTool />);
    const pdfInput = container.querySelector('input[type="file"][accept=".pdf"]');

    fireEvent.change(pdfInput, {
      target: { files: [makePdfFile("passport-form.pdf")] },
    });

    fireEvent.click(screen.getByRole("button", { name: /analyze pdf/i }));
    expect(await screen.findByText(/step 2/i)).toBeInTheDocument();

    const photoButton = screen.getByRole("button", { name: /insert photo/i });
    fireEvent.click(photoButton);

    const imageInput = container.querySelector('input[type="file"][accept="image/*"]');
    const imageFile = new File(["image"], "passport.png", { type: "image/png" });
    fireEvent.change(imageInput, {
      target: { files: [imageFile] },
    });

    expect(await screen.findByAltText("photo")).toBeInTheDocument();
    window.FileReader = originalFileReader;
  });
});
