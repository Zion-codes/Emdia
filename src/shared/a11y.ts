export type AriaProps = Partial<
  Record<`aria-${string}`, string | number | boolean>
>;

export function headingLevel(level: 1 | 2 | 3 | 4): AriaProps {
  return { "aria-level": level };
}

export function labelledBy(id: string): AriaProps {
  return { "aria-labelledby": id };
}

export function describedBy(id: string | undefined): AriaProps {
  return id ? { "aria-describedby": id } : {};
}

export function invalid(isInvalid: boolean): AriaProps {
  return isInvalid ? { "aria-invalid": true } : {};
}

export function pressed(isPressed: boolean): AriaProps {
  return { "aria-pressed": isPressed };
}

export function currentPage(isCurrent: boolean): AriaProps {
  return isCurrent ? { "aria-current": "page" } : {};
}
