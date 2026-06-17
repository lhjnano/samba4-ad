import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/ui/StatusBadge";

// ── DataTable ───────────────────────────────────────────────────────

describe("DataTable", () => {
  type Row = { name: string; age: number; active: boolean };

  const data: Row[] = [
    { name: "Alice", age: 30, active: true },
    { name: "Bob", age: 25, active: false },
  ];

  it("renders headers and rows", () => {
    render(
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "age", header: "Age" },
          { key: "active", header: "Status" },
        ]}
        data={data}
      />
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows empty message when no data", () => {
    render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        data={[]}
        emptyMessage="데이터가 없습니다"
      />
    );
    expect(screen.getByText("데이터가 없습니다")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        data={[]}
        loading
      />
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("calls onRowClick when row is clicked", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    let clicked: Row | null = null;

    render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        data={data}
        onRowClick={(row) => (clicked = row)}
      />
    );

    await user.click(screen.getByText("Alice"));
    expect(clicked).toEqual(data[0]);
  });

  it("uses custom render function", () => {
    render(
      <DataTable
        columns={[
          { key: "name", header: "Name" },
          {
            key: "active",
            header: "Active",
            render: (row) => (row.active ? "✅" : "❌"),
          },
        ]}
        data={data}
      />
    );
    expect(screen.getAllByText("✅").length).toBe(1);
    expect(screen.getAllByText("❌").length).toBe(1);
  });
});

// ── StatusBadge ─────────────────────────────────────────────────────

describe("StatusBadge", () => {
  it("renders enabled status", () => {
    const { container } = render(<StatusBadge status="enabled" />);
    expect(container.textContent).toContain("Active");
  });

  it("renders disabled status", () => {
    const { container } = render(<StatusBadge status="disabled" />);
    expect(container.textContent).toContain("Disabled");
  });

  it("renders locked status", () => {
    const { container } = render(<StatusBadge status="locked" />);
    expect(container.textContent).toContain("Locked");
  });

  it("renders healthy status", () => {
    const { container } = render(<StatusBadge status="healthy" />);
    expect(container.textContent).toContain("Healthy");
  });

  it("accepts custom label", () => {
    const { container } = render(<StatusBadge status="enabled" label="Custom" />);
    expect(container.textContent).toContain("Custom");
  });
});
