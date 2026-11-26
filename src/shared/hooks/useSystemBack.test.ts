import { renderHook } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { useSystemBack } from "./useSystemBack";

describe("useSystemBack", () => {
  it("registers hardwareBackPress listener only when active", async () => {
    const remove = jest.fn();
    let handler: Parameters<typeof BackHandler.addEventListener>[1] | undefined;

    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_eventName, callback) => {
        handler = callback;
        return { remove };
      });

    const onBack = jest.fn();

    const { rerender, unmount } = await renderHook(
      ({ active }: { active: boolean }) => useSystemBack(active, onBack),
      { initialProps: { active: false } }
    );

    expect(spy).not.toHaveBeenCalled();

    await rerender({ active: true });
    expect(spy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));

    expect(handler?.({} as never)).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);

    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
