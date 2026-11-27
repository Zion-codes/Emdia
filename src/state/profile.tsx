import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getSelfOwner,
  updateSelfOwnerName,
} from "../database/repositories/owners";
import { DEFAULT_SELF_OWNER_NAME } from "../database/seed";
import { getStored, setStored } from "../shared/storage";
import { avatarPalette } from "../theme/colors";
import { useDatabase } from "./database";

const LOCAL_PROFILE_KEY = "local_profile";

export interface LocalProfile {
  name: string;
  avatarColor: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarColor?: string;
}

type ProfileContextValue = {
  profile: LocalProfile;
  isLoaded: boolean;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
};

const DEFAULT_PROFILE: LocalProfile = {
  name: DEFAULT_SELF_OWNER_NAME,
  avatarColor: avatarPalette[0],
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function isValidAvatarColor(color: unknown): color is string {
  return (
    typeof color === "string" &&
    (avatarPalette as readonly string[]).includes(color)
  );
}

function parseStoredProfile(raw: string | null): LocalProfile | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.name !== "string" ||
      candidate.name.trim().length === 0
    ) {
      return null;
    }

    return {
      name: candidate.name.trim(),
      avatarColor: isValidAvatarColor(candidate.avatarColor)
        ? candidate.avatarColor
        : avatarPalette[0],
    };
  } catch {
    return null;
  }
}

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const db = useDatabase();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<LocalProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getStored(LOCAL_PROFILE_KEY), getSelfOwner(db)])
      .then(([raw, selfOwner]) => {
        if (cancelled) {
          return;
        }

        const storedProfile = parseStoredProfile(raw);
        const selfName = selfOwner?.name.trim() ?? "";

        if (storedProfile) {
          if (selfName.length > 0 && selfName !== storedProfile.name) {
            const reconciled: LocalProfile = {
              name: selfName,
              avatarColor: storedProfile.avatarColor,
            };
            setProfile(reconciled);
            void setStored(LOCAL_PROFILE_KEY, JSON.stringify(reconciled));
          } else {
            setProfile(storedProfile);
          }
        } else if (selfName.length > 0) {
          setProfile({
            name: selfName,
            avatarColor: avatarPalette[0],
          });
        } else {
          setProfile(DEFAULT_PROFILE);
        }

        setIsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(DEFAULT_PROFILE);
          setIsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<void> => {
      const nextName =
        input.name !== undefined ? input.name.trim() : profile.name;

      if (nextName.length === 0) {
        throw new Error("O nome do perfil é obrigatório.");
      }

      const nextColor = isValidAvatarColor(input.avatarColor)
        ? input.avatarColor
        : profile.avatarColor;

      if (input.name !== undefined) {
        await updateSelfOwnerName(db, nextName);
        await queryClient.invalidateQueries();
      }

      const nextProfile: LocalProfile = {
        name: nextName,
        avatarColor: nextColor,
      };

      setProfile(nextProfile);
      await setStored(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile));
    },
    [db, profile.avatarColor, profile.name, queryClient]
  );

  return (
    <ProfileContext.Provider value={{ profile, isLoaded, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfile precisa estar dentro de ProfileProvider");
  }

  return context;
}
