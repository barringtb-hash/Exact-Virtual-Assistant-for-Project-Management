export const MINIMAL_VALID_DDP = {
  project_name: "Mobile Lab Upgrade",
  phases: [
    {
      name: "Discovery",
      owner: "Casey Lead",
      status: "planned"
    }
  ],
  requirements: ["HIPAA compliant data storage"],
  risks: ["Timeline compression"]
};

export const MINIMAL_INVALID_DDP = {
  project_name: "AI", // too short triggers Ajv stub
  phases: []
};

export default {
  valid: MINIMAL_VALID_DDP,
  invalid: MINIMAL_INVALID_DDP,
};
