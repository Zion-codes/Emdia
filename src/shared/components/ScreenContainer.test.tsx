import { render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import { ScreenContainer } from "./ScreenContainer";

describe("ScreenContainer", () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOs,
    });
  });

  it("renders non-scrollable content on Android with tab bar space", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    await render(
      <ScreenContainer testID="screen-container">
        <Text>Conteúdo</Text>
      </ScreenContainer>
    );

    expect(screen.getByTestId("screen-container")).toBeTruthy();
    expect(screen.getByText("Conteúdo")).toBeTruthy();
    expect(screen.getByTestId("screen-container-kav")).toBeTruthy();
  });

  it("renders scrollable content on iOS without tab bar space", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });

    await render(
      <ScreenContainer
        scrollable
        includeTabBarSpace={false}
        keyboardVerticalOffset={24}
        edges={["top", "bottom"]}
      >
        <Text>Scroll</Text>
      </ScreenContainer>
    );

    expect(screen.getByText("Scroll")).toBeTruthy();
    expect(screen.getByTestId("screen-container-kav")).toBeTruthy();
    const scrollView = screen.getByTestId("screen-container-scroll");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
  });
});
