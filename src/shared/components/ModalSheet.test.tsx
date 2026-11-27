import { fireEvent, render, screen } from "@testing-library/react-native";
import { BackHandler, Platform, Text } from "react-native";
import { ModalSheet } from "./ModalSheet";

describe("ModalSheet", () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOs,
    });
  });

  it("renders title, content and handles close actions on Android", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    let backCallback:
      Parameters<typeof BackHandler.addEventListener>[1] | null = null;
    const addSpy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_eventName, callback) => {
        backCallback = callback;
        return { remove: jest.fn() };
      });

    const onClose = jest.fn();
    await render(
      <ModalSheet
        visible
        onClose={onClose}
        title="Editar perfil"
        testID="sheet"
      >
        <Text>Campos</Text>
      </ModalSheet>
    );

    expect(screen.getByText("Editar perfil")).toBeTruthy();
    expect(screen.getByText("Campos")).toBeTruthy();

    expect(screen.getByTestId("modal-sheet-kav")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("modal-sheet-content"));
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId("modal-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);

    expect(backCallback).not.toBeNull();
    expect(backCallback!({} as never)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);

    addSpy.mockRestore();
  });

  it("renders without title on iOS and uses padding behavior", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });

    const onClose = jest.fn();
    await render(
      <ModalSheet visible onClose={onClose}>
        <Text>Sem título</Text>
      </ModalSheet>
    );

    expect(screen.queryByTestId("modal-sheet-close")).toBeNull();
    expect(screen.getByText("Sem título")).toBeTruthy();
    expect(screen.getByTestId("modal-sheet-kav")).toBeTruthy();
  });
});
