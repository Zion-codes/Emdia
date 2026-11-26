import { render, screen, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import App from "./App";
import { Icon } from "./src/shared/components/Icon";
import { Text } from "./src/shared/components/Text";

describe("App", () => {
  it("renders the five Android bottom tabs in dark mode", async () => {
    const spy = jest
      .spyOn(ReactNative, "useColorScheme")
      .mockReturnValue("dark");

    await render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Resumo financeiro em construção")).toBeTruthy();
    });

    expect(screen.getAllByText("Início").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Transações")).toBeTruthy();
    expect(screen.getByText("Faturas")).toBeTruthy();
    expect(screen.getByText("Mais")).toBeTruthy();
    expect(screen.getByText("Configurações")).toBeTruthy();

    spy.mockRestore();
  });

  it("renders in light mode", async () => {
    const spy = jest
      .spyOn(ReactNative, "useColorScheme")
      .mockReturnValue("light");

    await render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Resumo financeiro em construção")).toBeTruthy();
    });

    spy.mockRestore();
  });

  it("renders selectable Text and default Icon size", async () => {
    await render(
      <>
        <Text selectable>Copiável</Text>
        <Icon name="home" color="#000000" testID="default-icon" />
      </>
    );

    expect(screen.getByText("Copiável")).toBeTruthy();
    expect(
      screen.getByTestId("default-icon", { includeHiddenElements: true }).props
        .width
    ).toBe(24);
  });
});
