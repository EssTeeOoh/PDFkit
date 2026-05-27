import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./tools/merge/MergeTool", () => () => <div>Merge Tool Mock</div>);
jest.mock("./tools/split/SplitTool", () => () => <div>Split Tool Mock</div>);
jest.mock("./tools/convert/ConvertTool", () => () => <div>Convert Tool Mock</div>);
jest.mock("./tools/sign/SignTool", () => () => <div>Sign Tool Mock</div>);
jest.mock("./tools/compress/CompressTool", () => () => <div>Compress Tool Mock</div>);
jest.mock("./utils/telemetry", () => ({
  reportFrontendError: jest.fn(),
  trackToolView: jest.fn(),
}));
jest.mock("./utils/haptics", () => ({
  hapticSuccess: jest.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: light)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ libreoffice: true }),
    });
  });

  it("renders the intro page by default", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("heading", { name: /shape PDFs with a steadier workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Samuel Olu/i })).toHaveAttribute(
      "href",
      "https://teeooh.pythonanywhere.com"
    );
    expect(screen.getByRole("button", { name: /open workspace/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/health")
    );
  });

  it("enters the workspace after dismissing the intro", async () => {
    localStorage.setItem("pdfkit-intro-dismissed", "1");

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("Merge Tool Mock")).toBeInTheDocument();
  });

  it("switches tools and persists the last active tool", async () => {
    localStorage.setItem("pdfkit-intro-dismissed", "1");

    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByRole("button", { name: /split split pages by page, chunk, or custom range/i }));

    expect(screen.getByText("Split Tool Mock")).toBeInTheDocument();
    expect(localStorage.getItem("pdfkit-last-tool")).toBe("split");
  });

  it("remembers the intro dismissal when entering the workspace", async () => {
    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByRole("button", { name: /open workspace/i }));

    expect(screen.getByText("Merge Tool Mock")).toBeInTheDocument();
    expect(localStorage.getItem("pdfkit-intro-dismissed")).toBe("1");
  });
});
