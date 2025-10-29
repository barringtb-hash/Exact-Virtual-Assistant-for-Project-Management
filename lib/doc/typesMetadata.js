const DOC_TYPE_METADATA = [
  {
    type: "charter",
    label: "Charter",
    keywords: ["project charter"],
  },
  {
    type: "ddp",
    label: "Design & Development Plan",
    keywords: [
      "design and development plan",
      "design & development plan",
      "development plan",
    ],
  },
];

const DOC_TYPE_METADATA_MAP = new Map(
  DOC_TYPE_METADATA.map((entry) => [entry.type, entry])
);

export function listDocTypeMetadata() {
  return DOC_TYPE_METADATA.map((entry) => ({ ...entry }));
}

export function getDocTypeMetadata(type) {
  return DOC_TYPE_METADATA_MAP.get(type);
}

export default DOC_TYPE_METADATA_MAP;
