import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../components/ui/EmptyState";
import { Users } from "lucide-react";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        icon={Users}
        title="사용자가 없습니다"
        description="새 사용자를 추가하세요"
      />
    );
    expect(screen.getByText("사용자가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("새 사용자를 추가하세요")).toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        icon={Users}
        title="Empty"
        action={<button>Add User</button>}
      />
    );
    expect(screen.getByText("Add User")).toBeInTheDocument();
  });
});
