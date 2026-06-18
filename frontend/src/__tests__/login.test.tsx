import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../pages/Login";

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    token: null,
    loading: false,
    logout: vi.fn(),
  }),
}));

// Mock api
vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with empty inputs", () => {
    renderLogin();
    expect(screen.getByText("AD Manager")).toBeInTheDocument();
    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(usernameInput.value).toBe("");
    expect(passwordInput.value).toBe("");
    expect(screen.getByRole("button", { name: /Login/ })).toBeInTheDocument();
  });

  it("calls login on submit with entered credentials", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(usernameInput, "Administrator");
    await user.type(passwordInput, "Admin123!");
    await user.click(screen.getByRole("button", { name: /Login/ }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("Administrator", "Admin123!");
    });
  });

  it("shows error on login failure", async () => {
    mockLogin.mockRejectedValueOnce({ message: "Invalid credentials" });
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(usernameInput, "baduser");
    await user.type(passwordInput, "badpass");
    await user.click(screen.getByRole("button", { name: /Login/ }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("allows editing username and password", async () => {
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(usernameInput, "superuser");
    await user.type(passwordInput, "secret123");

    expect(usernameInput).toHaveValue("superuser");
    expect(passwordInput).toHaveValue("secret123");
  });
});
