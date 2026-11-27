import { Share } from "react-native";
import {
  buildOwnerShareSummary,
  type BuildOwnerShareSummaryOptions,
  type OwnerStatement,
} from "../database/repositories/owners";

export type ShareResult = "shared" | "dismissed" | "error";

export async function shareOwnerStatementSummary(
  statement: OwnerStatement,
  options: BuildOwnerShareSummaryOptions
): Promise<ShareResult> {
  try {
    const message = buildOwnerShareSummary(statement, options);
    const title = `Resumo de ${statement.owner.name}`;
    const result = await Share.share({ message, title });

    if (result.action === Share.sharedAction) {
      return "shared";
    }

    return "dismissed";
  } catch {
    return "error";
  }
}
