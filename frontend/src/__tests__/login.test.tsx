import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../pages/Login";

// Mock AuthContext
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    user: null,
    token: null,
    loading: false,
    logout: vi.fn(),
  }),
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Mock api — hoisted-safe factory
const mockPost = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    get: (...args: unknown[]) => mockPost(...args),
    post: (...args: unknown[]) => mockPost(...args),
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
    mockPost.mockResolvedValue({
      data: { access_token: "fake-jwt", user: { username: "admin" } },
    });
  });

  it("renders login form with empty inputs", () => {
    renderLogin();
    const usernameInput = screen.getByLabelText(/common:username/) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/common:password/) as HTMLInputElement;
    expect(usernameInput.value).toBe("");
    expect(passwordInput.value).toBe("");
  });

  it("calls API on submit with entered credentials", async () => {
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/common:username/);
    const passwordInput = screen.getByLabelText(/common:password/);
    await user.type(usernameInput, "Administrator");
    await user.type(passwordInput, "Admin123!");
    await user.click(screen.getByRole("button", { name: /common:login_btn/ }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/api/v1/auth/login",
        { username: "Administrator", password: "Admin123!" },
      );
    });
  });

  it("shows error on login failure", async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: "Invalid credentials" } },
    });
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/common:username/);
    const passwordInput = screen.getByLabelText(/common:password/);
    await user.type(usernameInput, "baduser");
    await user.type(passwordInput, "badpass");
    await user.click(screen.getByRole("button", { name: /common:login_btn/ }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("switches to MFA phase when mfa_required", async () => {
    mockPost.mockResolvedValueOnce({
      data: { mfa_required: true, username: "admin" },
    });
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/common:username/);
    const passwordInput = screen.getByLabelText(/common:password/);
    await user.type(usernameInput, "admin");
    await user.type(passwordInput, "pass");
    await user.click(screen.getByRole("button", { name: /common:login_btn/ }));

    await waitFor(() => {
      expect(screen.getByText("common:mfa_enter_code")).toBeInTheDocument();
    });
  });

  it("allows editing username and password", async () => {
    const user = userEvent.setup();
    renderLogin();

    const usernameInput = screen.getByLabelText(/common:username/);
    const passwordInput = screen.getByLabelText(/common:password/);

    await user.type(usernameInput, "superuser");
    await user.type(passwordInput, "secret123");

    expect(usernameInput).toHaveValue("superuser");
    expect(passwordInput).toHaveValue("secret123");
  });
});
