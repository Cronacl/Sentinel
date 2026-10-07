import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";

import {
  ControlledCheckboxField,
  ControlledSwitchField,
} from "./controlled-fields";

function getClickableLabel(markup: string, slot: string) {
  const match = markup.match(
    new RegExp(`<label data-slot="${slot}"[^>]*>([\\s\\S]*?)</label>`),
  );
  return match?.[1] ?? null;
}

function ToggleFields() {
  const form = useForm({
    defaultValues: { notify: true, terms: false },
  });

  return (
    <>
      <ControlledSwitchField
        control={form.control}
        description="Send a notification when a run finishes."
        label="Notify"
        name="notify"
      />
      <ControlledCheckboxField
        control={form.control}
        description="Required to continue."
        label="Accept terms"
        name="terms"
      />
    </>
  );
}

// HeroUI 3.2 only makes `*.Content` clickable: the control and its label text
// must render inside that <label>, next to the hidden input.
describe("controlled toggle fields", () => {
  const markup = renderToStaticMarkup(<ToggleFields />);

  it("renders the switch control and label inside the clickable content", () => {
    const content = getClickableLabel(markup, "switch-content");

    expect(content).not.toBeNull();
    expect(content).toContain('role="switch"');
    expect(content).toContain('name="notify"');
    expect(content).toContain('data-slot="switch-control"');
    expect(content).toContain("Notify");
    expect(content).toContain("Send a notification when a run finishes.");
  });

  it("renders the checkbox control and label inside the clickable content", () => {
    const content = getClickableLabel(markup, "checkbox-content");

    expect(content).not.toBeNull();
    expect(content).toContain('type="checkbox"');
    expect(content).toContain('name="terms"');
    expect(content).toContain('data-slot="checkbox-control"');
    expect(content).toContain("Accept terms");
  });
});
