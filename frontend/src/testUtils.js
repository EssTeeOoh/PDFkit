import { render } from "@testing-library/react";
import { ToastProvider } from "./components/Toast";

export function renderWithProviders(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

export function makePdfFile(name = "sample.pdf", contents = "pdf") {
  return new File([contents], name, { type: "application/pdf" });
}
