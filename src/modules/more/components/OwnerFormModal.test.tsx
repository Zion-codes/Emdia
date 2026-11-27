import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  createOwner,
  deleteOwner,
  updateOwner,
  updateSelfOwnerName,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { OwnerFormModal } from "./OwnerFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createOwner: jest.fn(),
    updateOwner: jest.fn(),
    updateSelfOwnerName: jest.fn(),
    deleteOwner: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

const mockCreateOwner = jest.mocked(createOwner);
const mockUpdateOwner = jest.mocked(updateOwner);
const mockUpdateSelfOwnerName = jest.mocked(updateSelfOwnerName);
const mockDeleteOwner = jest.mocked(deleteOwner);
const mockUseDatabase = jest.mocked(useDatabase);

describe("OwnerFormModal", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
  });

  it("renders no content when not visible", async () => {
    await render(
      <OwnerFormModal
        visible={false}
        owner={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("owner-name-input")).toBeNull();
  });

  it("validates and creates a new owner", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockCreateOwner.mockResolvedValue({
      id: "owner-new",
      name: "Maria",
      isSelf: false,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    });

    await render(
      <OwnerFormModal
        visible
        owner={null}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("owner-submit-button"));
    expect(screen.getByTestId("owner-form-error").props.children).toBe(
      "Informe o nome do participante."
    );

    await fireEvent.changeText(
      screen.getByTestId("owner-name-input"),
      "  Maria  "
    );
    await fireEvent.press(screen.getByTestId("owner-submit-button"));

    await waitFor(() => {
      expect(mockCreateOwner).toHaveBeenCalledWith(fakeDb, { name: "Maria" });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles create error", async () => {
    mockCreateOwner.mockRejectedValue(new Error("db error"));

    await render(
      <OwnerFormModal
        visible
        owner={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(screen.getByTestId("owner-name-input"), "Maria");
    await fireEvent.press(screen.getByTestId("owner-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("owner-form-error").props.children).toBe(
        "Não foi possível salvar o participante."
      );
    });
  });

  it("renames a non-self owner", async () => {
    const owner = {
      id: "owner-1",
      name: "Carlos",
      isSelf: false,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateOwner.mockResolvedValue({ ...owner, name: "Carlos Junior" });

    await render(
      <OwnerFormModal
        visible
        owner={owner}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("owner-name-input").props.value).toBe("Carlos");

    await fireEvent.changeText(
      screen.getByTestId("owner-name-input"),
      "Carlos Junior"
    );
    await fireEvent.press(screen.getByTestId("owner-submit-button"));

    await waitFor(() => {
      expect(mockUpdateOwner).toHaveBeenCalledWith(fakeDb, "owner-1", {
        name: "Carlos Junior",
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renames the self owner without offering delete", async () => {
    const owner = {
      id: "self-1",
      name: "EU",
      isSelf: true,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    mockUpdateSelfOwnerName.mockResolvedValue({ ...owner, name: "Meu Nome" });

    await render(
      <OwnerFormModal
        visible
        owner={owner}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByText("Renomear responsável padrão")).toBeTruthy();
    expect(screen.queryByTestId("owner-delete-button")).toBeNull();

    await fireEvent.changeText(
      screen.getByTestId("owner-name-input"),
      "Meu Nome"
    );
    await fireEvent.press(screen.getByTestId("owner-submit-button"));

    await waitFor(() => {
      expect(mockUpdateSelfOwnerName).toHaveBeenCalledWith(fakeDb, "Meu Nome");
    });
  });

  it("confirms deletion of a non-self owner and handles delete error", async () => {
    const owner = {
      id: "owner-2",
      name: "Carlos",
      isSelf: false,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockDeleteOwner
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);

    await render(
      <OwnerFormModal
        visible
        owner={owner}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("owner-delete-button"));
    expect(screen.getByTestId("owner-delete-confirm-box")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("owner-cancel-delete-button"));
    expect(screen.queryByTestId("owner-delete-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("owner-delete-button"));
    await fireEvent.press(screen.getByTestId("owner-confirm-delete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("owner-form-error").props.children).toBe(
        "Não foi possível excluir o participante."
      );
    });

    await fireEvent.press(screen.getByTestId("owner-confirm-delete-button"));

    await waitFor(() => {
      expect(mockDeleteOwner).toHaveBeenCalledWith(fakeDb, "owner-2");
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
