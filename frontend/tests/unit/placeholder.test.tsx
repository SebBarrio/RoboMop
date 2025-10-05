import { render, screen } from "@testing-library/react";
import App from "../../src/App";

describe("App", () => {
  it("renders initialization message", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /initialized/i })).toBeInTheDocument();
  });
});
