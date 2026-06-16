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

  it("renders login form with default credentials", () => {
    renderLogin();
    expect(screen.getByText("AD Manager")).toBeInTheDocument();
    // Both username and password default to "admin"
    const inputs = screen.getAllByDisplayValue("admin");
    expect(inputs).toHaveLength(2);
    expect(screen.getByRole("button", { name: /로그인/ })).toBeInTheDocument();
  });

  it("shows hint text about mock credentials", () => {
    renderLogin();
    expect(screen.getByText(/admin \/ admin/)).toBeInTheDocument();
  });

  it("calls login on submit", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: /로그인/ }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin", "admin");
    });
  });

  it("shows error on login failure", async () => {
    mockLogin.mockRejectedValueOnce({ message: "Invalid credentials" });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: /로그인/ }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("allows editing username and password", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();

    // Select by type since both default to "admin" with no labels
    const usernameInput = container.querySelector('input[type="text"]')!;
    const passwordInput = container.querySelector('input[type="password"]')!;

    await user.clear(usernameInput);
    await user.type(usernameInput, "superuser");
    await user.clear(passwordInput);
    await user.type(passwordInput, "secret123");

    expect(usernameInput).toHaveValue("superuser");
    expect(passwordInput).toHaveValue("secret123");
  });
});
