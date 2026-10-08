import {
  asRecord,
  readArray,
  readRecord,
  readString,
} from "@/lib/ai/chat/engines/acp/schema";

import type { ExternalQuestion, ExternalQuestionResponse } from "./user-input";

// ACP form elicitations (`elicitation/create`, mode "form") as questions on
// the shared user-input card, and the answers back as the form `content`
// (design §2.14). Supported fields: strings with enum / oneOf choices,
// booleans (Yes / No), multi-select arrays, and free text or numbers.
// Pure.

type FieldKind = "boolean" | "multi" | "number" | "text";

export type ElicitationField = {
  id: string;
  kind: FieldKind;
  question: ExternalQuestion;
  required: boolean;
};

function readChoices(schema: unknown) {
  const enumValues = readArray(schema, "enum");
  if (enumValues) {
    const names = readArray(schema, "enumNames") ?? [];
    return enumValues.flatMap((value, index) =>
      typeof value === "string"
        ? [
            {
              id: value,
              label:
                typeof names[index] === "string"
                  ? (names[index] as string)
                  : value,
            },
          ]
        : [],
    );
  }
  const oneOf = readArray(schema, "oneOf") ?? readArray(schema, "anyOf");
  return (oneOf ?? []).flatMap((entry) => {
    const value = asRecord(entry)?.const;
    return typeof value === "string"
      ? [{ id: value, label: readString(entry, "title") ?? value }]
      : [];
  });
}

/** The form's fields, in schema order. */
export function readElicitationFields(
  requestedSchema: unknown,
): ElicitationField[] {
  const properties = readRecord(requestedSchema, "properties") ?? {};
  const required = new Set(
    (readArray(requestedSchema, "required") ?? []).filter(
      (entry): entry is string => typeof entry === "string",
    ),
  );

  return Object.entries(properties).flatMap(
    ([id, schema]): ElicitationField[] => {
      const type = readString(schema, "type");
      const title = readString(schema, "title") ?? id;
      const description = readString(schema, "description");
      const base = {
        header: title,
        id,
        question: description ?? title,
      };

      if (type === "boolean") {
        return [
          {
            id,
            kind: "boolean" as const,
            question: {
              ...base,
              multiSelect: false,
              options: [
                { id: "true", label: "Yes" },
                { id: "false", label: "No" },
              ],
            },
            required: required.has(id),
          },
        ];
      }
      if (type === "array") {
        return [
          {
            id,
            kind: "multi" as const,
            question: {
              ...base,
              multiSelect: true,
              options: readChoices(readRecord(schema, "items")),
            },
            required: required.has(id),
          },
        ];
      }
      return [
        {
          id,
          kind:
            type === "number" || type === "integer"
              ? ("number" as const)
              : ("text" as const),
          question: {
            ...base,
            multiSelect: false,
            options: readChoices(schema),
          },
          required: required.has(id),
        },
      ];
    },
  );
}

/** The user's answers as the form content (null when a required field is missing). */
export function toElicitationContent(
  fields: readonly ElicitationField[],
  response: ExternalQuestionResponse,
): Record<string, string | number | boolean | string[]> | null {
  const content: Record<string, string | number | boolean | string[]> = {};
  const lone = fields.length === 1 ? fields[0] : null;

  for (const field of fields) {
    const answer = response.answers.find(
      (entry) => entry.questionId === field.id,
    );
    const text =
      answer?.text ??
      (lone === field ? (response.additionalContext ?? undefined) : undefined);
    switch (field.kind) {
      case "boolean": {
        const choice = answer?.selectedOptionIds[0];
        if (choice) content[field.id] = choice === "true";
        break;
      }
      case "multi":
        if (answer && answer.selectedOptionIds.length > 0) {
          content[field.id] = answer.selectedOptionIds;
        }
        break;
      case "number": {
        const value = Number(answer?.selectedOptionIds[0] ?? text);
        if (
          (answer?.selectedOptionIds[0] ?? text) != null &&
          Number.isFinite(value)
        ) {
          content[field.id] = value;
        }
        break;
      }
      default: {
        const value = answer?.selectedOptionIds[0] ?? text;
        if (value != null && value !== "") content[field.id] = value;
        break;
      }
    }
    if (field.required && !(field.id in content)) {
      return null;
    }
  }
  return content;
}

/** Only https URLs, or plain http on the loopback interface, are offered to open. */
export function isOpenableElicitationUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return true;
    }
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
