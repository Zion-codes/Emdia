import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { DateField } from "./DateField";

describe("DateField", () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOs,
    });
  });

  it("opens native Android picker, updates date on set and closes on dismissed", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    const initialDate = new Date(2026, 4, 10);
    const nextDate = new Date(2026, 4, 20);
    const onChange = jest.fn();

    await render(
      <DateField label="Vencimento" value={initialDate} onChange={onChange} />
    );

    expect(screen.getByText("Vencimento")).toBeTruthy();
    expect(screen.getByText("10/05/2026")).toBeTruthy();
    expect(screen.queryByTestId("native-date-time-picker")).toBeNull();

    await fireEvent.press(screen.getByTestId("date-field-trigger"));
    const picker = screen.getByTestId("native-date-time-picker");
    expect(picker).toBeTruthy();

    await fireEvent(
      picker,
      "onChange",
      { type: "neutralButtonPressed", nativeEvent: {} },
      undefined
    );
    expect(screen.getByTestId("native-date-time-picker")).toBeTruthy();

    await fireEvent(
      screen.getByTestId("native-date-time-picker"),
      "onChange",
      { type: "set", nativeEvent: {} },
      nextDate
    );
    expect(onChange).toHaveBeenCalledWith(nextDate);
    expect(screen.queryByTestId("native-date-time-picker")).toBeNull();

    await fireEvent.press(screen.getByTestId("date-field-trigger"));
    await fireEvent(
      screen.getByTestId("native-date-time-picker"),
      "onChange",
      { type: "dismissed", nativeEvent: {} },
      undefined
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("native-date-time-picker")).toBeNull();
  });

  it("opens iOS modal sheet and handles cancel and confirm", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });

    const initialDate = new Date(2026, 4, 10);
    const nextDate = new Date(2026, 4, 25);
    const onChange = jest.fn();

    await render(<DateField value={initialDate} onChange={onChange} />);

    await fireEvent.press(screen.getByTestId("date-field-trigger"));
    expect(screen.getByTestId("date-field-ios-modal")).toBeTruthy();

    const picker = screen.getByTestId("native-date-time-picker");
    await fireEvent(
      picker,
      "onChange",
      { type: "set", nativeEvent: {} },
      undefined
    );
    await fireEvent(
      picker,
      "onChange",
      { type: "set", nativeEvent: {} },
      nextDate
    );

    await fireEvent.press(screen.getByTestId("date-field-cancel"));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("date-field-trigger"));
    await fireEvent(
      screen.getByTestId("native-date-time-picker"),
      "onChange",
      { type: "set", nativeEvent: {} },
      nextDate
    );
    await fireEvent.press(screen.getByTestId("date-field-confirm"));
    expect(onChange).toHaveBeenCalledWith(nextDate);
  });

  it("does not open when disabled", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    await render(
      <DateField value={new Date(2026, 4, 10)} onChange={jest.fn()} disabled />
    );

    await fireEvent.press(screen.getByTestId("date-field-trigger"));
    expect(screen.queryByTestId("native-date-time-picker")).toBeNull();
  });
});
