import {
  describedBy,
  headingLevel,
  invalid,
  labelledBy,
  pressed,
  currentPage,
} from "./a11y";

describe("a11y helpers", () => {
  it("builds aria props", () => {
    expect(headingLevel(1)).toEqual({ "aria-level": 1 });
    expect(labelledBy("title")).toEqual({ "aria-labelledby": "title" });
    expect(describedBy("hint")).toEqual({ "aria-describedby": "hint" });
    expect(describedBy(undefined)).toEqual({});
    expect(invalid(true)).toEqual({ "aria-invalid": true });
    expect(invalid(false)).toEqual({});
    expect(pressed(true)).toEqual({ "aria-pressed": true });
    expect(currentPage(true)).toEqual({ "aria-current": "page" });
    expect(currentPage(false)).toEqual({});
  });
});
