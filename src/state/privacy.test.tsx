import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { type JSX } from "react";
import { Text } from "react-native";
import { setStored } from "../shared/storage";
import { PrivacyProvider, useMoney, usePrivacy } from "./privacy";

function Consumer(): JSX.Element {
  const { isHidden, toggle } = usePrivacy();
  const formatMoney = useMoney();

  return (
    <Text testID="money" onPress={toggle}>
      {`${isHidden}:${formatMoney(100)}`}
    </Text>
  );
}

describe("PrivacyProvider", () => {
  it("loads stored hidden state and toggles money formatting", async () => {
    await setStored("hide_values", "true");

    await render(
      <PrivacyProvider>
        <Consumer />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("money").props.children).toBe("true:R$ ••••");
    });

    await act(async () => {
      screen.getByTestId("money").props.onPress();
    });

    expect(screen.getByTestId("money").props.children).toContain("false:");
    expect(screen.getByTestId("money").props.children).toContain("100,00");
  });

  it("throws when usePrivacy is used outside provider", async () => {
    await expect(renderHook(() => usePrivacy())).rejects.toThrow(
      "usePrivacy precisa estar dentro de PrivacyProvider"
    );
  });
});
