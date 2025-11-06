import {
  normalizeObjectEntries,
  normalizeStringList,
  toTrimmedString,
} from "../../../lib/charter/normalize.js";
import { CHARTER_FIELDS, type CharterFieldId } from "./schema";
import type { GuidedState } from "./guidedState";

type CharterObjectEntry = Record<string, string>;

export type CharterDTOValue = string | string[] | CharterObjectEntry[];

export type CharterDTO = Partial<Record<CharterFieldId, CharterDTOValue>>;

export function guidedStateToCharterDTO(state: GuidedState | null | undefined): CharterDTO {
  const dto: CharterDTO = {};

  if (!state || !state.fields) {
    return dto;
  }

  for (const field of CHARTER_FIELDS) {
    const fieldState = state.fields[field.id];
    if (!fieldState || fieldState.status !== "confirmed") {
      continue;
    }

    const confirmedValue = fieldState.confirmedValue ?? null;

    switch (field.type) {
      case "string":
      case "textarea":
      case "date": {
        dto[field.id] = toTrimmedString(confirmedValue);
        break;
      }
      case "string_list": {
        dto[field.id] = normalizeStringList(confirmedValue);
        break;
      }
      case "object_list": {
        const childIds = (field.children ?? []).map((child) => child.id);
        dto[field.id] = normalizeObjectEntries(confirmedValue, childIds);
        break;
      }
      default:
        break;
    }
  }

  return dto;
}
