import { renderHook } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { useColumns, useIsWide } from "./breakpoints";

describe("breakpoints", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns narrow layout values below 900px", async () => {
    jest.spyOn(Dimensions, "get").mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    const { result } = await renderHook(() => ({
      isWide: useIsWide(),
      columns: useColumns(),
    }));

    expect(result.current.isWide).toBe(false);
    expect(result.current.columns).toBe(1);
  });

  it("returns wide 2-column layout values between 900px and 1279px", async () => {
    jest.spyOn(Dimensions, "get").mockReturnValue({
      width: 900,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });

    const { result } = await renderHook(() => ({
      isWide: useIsWide(),
      columns: useColumns(),
    }));

    expect(result.current.isWide).toBe(true);
    expect(result.current.columns).toBe(2);
  });

  it("returns wider 3-column layout values at or above 1280px", async () => {
    jest.spyOn(Dimensions, "get").mockReturnValue({
      width: 1280,
      height: 800,
      scale: 2,
      fontScale: 1,
    });

    const { result } = await renderHook(() => ({
      isWide: useIsWide(),
      columns: useColumns(),
    }));

    expect(result.current.isWide).toBe(true);
    expect(result.current.columns).toBe(3);
  });
});
