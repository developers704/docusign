export type UserRole = "super_admin" | "office_admin" | "office_user" | "viewer";

export type OfficeRecord = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  brandColor: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  officeId: string;
  name: string;
  email: string;
  role: Exclude<UserRole, "super_admin">;
  passwordSalt: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type EnvelopeStatus =
  | "draft"
  | "scheduled"
  | "sent"
  | "viewed"
  | "completed"
  | "declined"
  | "voided"
  | "expired";

export type RecipientStatus =
  | "pending"
  | "sent"
  | "active"
  | "viewed"
  | "verified"
  | "signed"
  | "approved"
  | "acknowledged"
  | "requested_change"
  | "completed"
  | "declined";

export type WorkflowType = "sequential" | "parallel" | "grouped";
export type RecipientType =
  | "signer"
  | "approver"
  | "reviewer"
  | "witness"
  | "receives_copy"
  | "view_only"
  | "in_person_signer";
export type AuthenticationMethod = "none" | "email_otp";
export type DeclineBehavior = "stop_envelope" | "continue_optional_only";

export type SignatureMethod = "drawn" | "typed" | "uploaded";

export type DocumentFieldType =
  | "signature"
  | "initials"
  | "signature_date"
  | "signed_at_datetime"
  | "signer_name"
  | "signer_email"
  | "signer_title"
  | "signer_company"
  | "witness_signature"
  | "manager_signature"
  | "office_admin_signature"
  | "hr_signature"
  | "notary_signature"
  | "name"
  | "email"
  | "date"
  | "text"
  | "checkbox"
  | "multiline_text"
  | "phone"
  | "number"
  | "currency"
  | "percentage"
  | "datetime"
  | "time"
  | "address"
  | "city"
  | "state"
  | "postal_code"
  | "country"
  | "employee_id"
  | "customer_id"
  | "vendor_id"
  | "office_name"
  | "department"
  | "job_title"
  | "manager_name"
  | "policy_name"
  | "agreement_number"
  | "checkbox_group"
  | "radio_group"
  | "dropdown"
  | "multi_select"
  | "yes_no"
  | "consent_checkbox"
  | "policy_acknowledgment"
  | "terms_acceptance"
  | "privacy_acknowledgment"
  | "confidentiality_acknowledgment"
  | "code_of_conduct_acknowledgment"
  | "employee_handbook_acknowledgment"
  | "safety_policy_acknowledgment"
  | "office_policy_acknowledgment"
  | "warranty_acknowledgment"
  | "repair_authorization"
  | "payment_authorization"
  | "financing_consent"
  | "marketing_consent"
  | "sms_consent"
  | "email_consent"
  | "photo_release"
  | "background_check_consent"
  | "manager_approval"
  | "internal_approval"
  | "attachment_request"
  | "auto_date"
  | "auto_datetime"
  | "document_id"
  | "envelope_id"
  | "office_id"
  | "template_id"
  | "sequence_number"
  | "calculated_text"
  | "hidden_metadata"
  | "label"
  | "heading"
  | "paragraph"
  | "divider"
  | "instruction_text"
  | "upload_attachment"
  | "approve"
  | "decline"
  | "request_change"
  | "acknowledge"
  | "view_only";

export type DocumentField = {
  id: string;
  type: DocumentFieldType;
  recipientId: string;
  templateRoleId?: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label: string;
  tooltip: string;
  value?: string;
  /** Choices for radio_group / dropdown / multi_select */
  options?: string[];
};

export type RecipientRecord = {
  id: string;
  envelopeId?: string;
  templateRoleId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  recipientType?: RecipientType;
  order: number;
  signingStep?: number;
  stepGroup?: string | null;
  status: RecipientStatus;
  isRequired?: boolean;
  activatedAt?: string | null;
  completedAt?: string | null;
  approvedAt?: string | null;
  acknowledgedAt?: string | null;
  tokenHash: string;
  signingToken?: string; // legacy compatibility
  tokenExpiresAt?: string | null;
  tokenVersion?: number;
  tokenRevokedAt?: string | null;
  authenticationMethod?: AuthenticationMethod;
  otpHash: string | null;
  otpExpiresAt: string | null;
  otpVerifiedAt: string | null;
  otpAttemptCount?: number;
  otpLockedUntil?: string | null;
  otpLastSentAt?: string | null;
  reminderCount?: number;
  metadata?: Record<string, string | number | boolean | null>;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  signatureMethod: SignatureMethod | null;
  signerIpAddress: string | null;
  signerUserAgent: string | null;
  /** IANA timezone from the signer's browser at signing time (e.g. Asia/Karachi). */
  signerTimezone?: string | null;
  /** Browser `getTimezoneOffset()` at signing time (minutes). */
  signerTimezoneOffsetMinutes?: number | null;
  /** Exact local wall-clock string from the signer's device (printed on certificate). */
  signerLocalTimeDisplay?: string | null;
};

export type EnvelopeRecord = {
  schemaVersion?: number;
  id: string;
  officeId: string;
  officeName: string;
  envelopeNumber: string;
  title: string;
  message: string;
  /** DocuSign-style agreement category (HR, Sales, custom, …). */
  category?: string | null;
  /** Reminder cadence preference stored on the envelope. */
  reminderFrequency?: string | null;
  originalFileName: string;
  originalPdfPath: string;
  workingPdfPath: string | null;
  signedPdfPath: string | null;
  workflowType?: WorkflowType;
  declineBehavior?: DeclineBehavior;
  templateId?: string | null;
  templateVersionId?: string | null;
  status: EnvelopeStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  scheduledSendAt?: string | null;
  /** IANA timezone used when the sender scheduled (e.g. America/Los_Angeles). */
  scheduledTimezone?: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdByUserId: string;
  recipients: RecipientRecord[];
  originalSha256: string | null;
  signedSha256: string | null;
  certificateId: string | null;
  fields?: DocumentField[];
  pageAssignments?: Array<{
    id: string;
    pageNumber: number;
    pageLabel: string;
    assignedRecipientIds: string[];
    assignedTemplateRoleIds: string[];
    responsibilityType:
      | "must_complete"
      | "must_sign"
      | "must_approve"
      | "must_acknowledge"
      | "view_only"
      | "shared"
      | "internal_only";
    visibility:
      | "all_recipients"
      | "assigned_recipients_only"
      | "internal_users_only"
      | "sender_only"
      | "specific_roles";
    isRequired: boolean;
    signingStep: number | null;
    allowComments: boolean;
    allowAttachments: boolean;
    readOnly: boolean;
  }>;
  preparedAt?: string | null;
  /** When set, this envelope was created by bulk send with the same document for each recipient. */
  bulkBatchId?: string | null;
  /** Shared title before recipient name was appended (bulk send). */
  bulkBaseTitle?: string | null;
};

export type AuditEventType =
  | "envelope_created"
  | "envelope_sent"
  | "email_sent"
  | "email_failed"
  | "recipient_viewed"
  | "otp_sent"
  | "otp_verified"
  | "recipient_signed"
  | "recipient_declined"
  | "reminder_sent"
  | "envelope_completed"
  | "envelope_voided"
  | "envelope_deleted"
  | "document_downloaded"
  | "template_created"
  | "template_updated"
  | "template_duplicated"
  | "template_published"
  | "template_unpublished"
  | "template_archived"
  | "template_deleted"
  | "template_restored"
  | "template_version_created"
  | "template_version_restored"
  | "template_document_uploaded"
  | "template_document_replaced"
  | "template_role_added"
  | "template_role_removed"
  | "template_field_added"
  | "template_field_updated"
  | "template_field_removed"
  | "template_page_assignment_added"
  | "template_page_assignment_updated"
  | "template_page_assignment_removed"
  | "workflow_type_selected"
  | "recipient_added"
  | "recipient_updated"
  | "recipient_removed"
  | "recipient_role_mapped"
  | "signing_step_created"
  | "signing_step_activated"
  | "signing_step_completed"
  | "recipient_activated"
  | "invitation_sent"
  | "invitation_failed"
  | "recipient_approved"
  | "recipient_acknowledged"
  | "recipient_requested_change"
  | "page_access_granted"
  | "page_access_denied"
  | "page_completed"
  | "field_completed"
  | "unauthorized_field_submission"
  | "token_rotated"
  | "token_revoked"
  | "otp_failed"
  | "otp_locked"
  | "legacy_envelope_normalized";

export type AuditEvent = {
  id: string;
  officeId: string;
  envelopeId: string;
  recipientId: string | null;
  type: AuditEventType;
  message: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TemplateStatus = "draft" | "published" | "archived";
export type TemplateVisibility = "private" | "office" | "selected_offices" | "selected_groups" | "global";
export type TemplateRoleType =
  | "signer"
  | "approver"
  | "reviewer"
  | "witness"
  | "receives_copy"
  | "view_only"
  | "in_person_signer";
export type TemplatePageResponsibility =
  | "must_complete"
  | "must_sign"
  | "must_approve"
  | "must_acknowledge"
  | "view_only"
  | "shared"
  | "internal_only";
export type TemplatePageVisibility =
  | "all_recipients"
  | "assigned_recipients_only"
  | "internal_users_only"
  | "sender_only"
  | "specific_roles";

export type TemplateDocumentRecord = {
  id: string;
  templateId: string;
  versionId: string;
  originalFileName: string;
  storedFileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  pageCount: number;
  sha256: string;
  sortOrder: number;
  createdAt: string;
};

export type TemplateRecipientRoleRecord = {
  id: string;
  templateId: string;
  versionId: string;
  roleName: string;
  roleType: TemplateRoleType;
  signingOrder: number;
  signingStep: number;
  isRequired: boolean;
  canEditFields: boolean;
  canViewAllPages: boolean;
  /** Prefills when starting an agreement from this template (still editable). */
  defaultName?: string;
  defaultEmail?: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateFieldRecord = {
  id: string;
  type: DocumentFieldType;
  templateId: string;
  versionId: string;
  documentId: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  recipientRoleId: string | null;
  required: boolean;
  readOnly: boolean;
  hidden: boolean;
  locked: boolean;
  label: string;
  fieldName: string;
  internalKey: string;
  placeholder: string;
  helpText: string;
  tooltip: string;
  defaultValue: string;
  validationRule: string;
  minimumLength: number | null;
  maximumLength: number | null;
  minimumValue: number | null;
  maximumValue: number | null;
  regexPattern: string;
  tabOrder: number | null;
  fontSize: number | null;
  alignment: "left" | "center" | "right";
  conditionalVisibility: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplatePageAssignmentRecord = {
  id: string;
  templateId: string;
  versionId: string;
  documentId: string | null;
  pageNumber: number;
  pageLabel: string;
  assignedRoleIds: string[];
  responsibilityType: TemplatePageResponsibility;
  visibility: TemplatePageVisibility;
  isRequired: boolean;
  signingStep: number | null;
  allowComments: boolean;
  allowAttachments: boolean;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TemplateVersionRecord = {
  id: string;
  templateId: string;
  versionNumber: number;
  title: string;
  message: string;
  description: string;
  documentMetadata: TemplateDocumentRecord[];
  recipientRoles: TemplateRecipientRoleRecord[];
  fields: TemplateFieldRecord[];
  pageAssignments: TemplatePageAssignmentRecord[];
  createdByUserId: string;
  createdAt: string;
  changeSummary: string;
  isCurrent: boolean;
};

export type TemplateRecord = {
  schemaVersion?: number;
  id: string;
  officeId: string;
  ownerUserId: string | null;
  name: string;
  title: string;
  description: string;
  message: string;
  content?: string; // compatibility
  sourceType: "policy_text" | "uploaded_pdf";
  category: string;
  tags: string[];
  status: TemplateStatus;
  visibility: TemplateVisibility;
  selectedOfficeIds: string[];
  selectedGroupIds: string[];
  publishedAt: string | null;
  archivedAt: string | null;
  currentVersionId: string | null;
  usageCount: number;
  expiryDays: number;
  internalNotes: string;
  folderIds: string[];
  matchingEligible: boolean;
  recipientRoles: TemplateRecipientRoleRecord[];
  fields: TemplateFieldRecord[];
  pageAssignments: TemplatePageAssignmentRecord[];
  documents: TemplateDocumentRecord[];
  versions: TemplateVersionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateFolderKind = "my" | "shared";

export type TemplateFolderRecord = {
  id: string;
  officeId: string;
  name: string;
  kind: TemplateFolderKind;
  createdAt: string;
  updatedAt: string;
};

/** Global SMTP credentials editable from Settings (overrides env when set). */
export type SmtpSettingsRecord = {
  /** Which preset the admin chose in Settings. */
  provider?: "custom" | "gmail";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** Display name in the email From header, e.g. "Valliani HR". */
  fromName?: string;
  updatedAt: string;
};

/** Network admin profile (name / password / branding) editable from Settings. */
export type AppProfileRecord = {
  /** Display name for the network / super admin account. */
  adminName: string;
  /** Label shown for the office network (header / branding). */
  networkName: string;
  /** Optional password override for env-based super admin. */
  adminPasswordSalt?: string;
  adminPasswordHash?: string;
  updatedAt: string;
};

/** In-app header notifications (viewed / signed activity). */
export type AppNotificationRecord = {
  id: string;
  officeId: string;
  envelopeId: string | null;
  type: "recipient_viewed" | "recipient_signed" | "recipient_approved" | "recipient_acknowledged" | "envelope_completed";
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
  /** User IDs who have dismissed/read this notification. */
  readBy: string[];
};

export type PublishedFormStatus = "active" | "disabled";

export type PowerFormStatus = "draft" | "published" | "paused" | "archived";

export type PowerFormAccessType =
  | "public"
  | "access_code"
  | "email_verified"
  | "authenticated"
  | "office_only"
  | "invitation_only";

export type PowerFormRecipientMode =
  | "self_signer"
  | "self_signer_plus_internal"
  | "multiple_public_recipients"
  | "fixed_recipients"
  | "mixed";

export type PowerFormSubmissionStatus =
  | "started"
  | "awaiting_verification"
  | "verified"
  | "envelope_created"
  | "signing"
  | "completed"
  | "cancelled"
  | "blocked"
  | "failed";

export type PowerFormCustomIntakeField = {
  id: string;
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "textarea";
  required: boolean;
};

export type PowerFormRecipientMapping = {
  templateRoleId: string;
  source: "intake" | "fixed";
  /** When source is intake, map from intake keys (e.g. name/email). */
  nameFrom?: string;
  emailFrom?: string;
  /** When source is fixed. */
  fixedName?: string;
  fixedEmail?: string;
};

export type PowerFormRecord = {
  schemaVersion: number;
  id: string;
  officeId: string;
  createdByUserId: string | null;
  /** Legacy display / email attribution */
  createdByEmail: string;
  templateId: string;
  templateVersionId: string | null;
  name: string;
  slug: string;
  description: string;
  status: PowerFormStatus;
  accessType: PowerFormAccessType;
  recipientMode: PowerFormRecipientMode;
  workflowType: "sequential" | "parallel" | "grouped";
  successMessage: string;
  redirectUrl: string | null;
  allowMultipleSubmissions: boolean;
  requireEmailVerification: boolean;
  requireAccessCode: boolean;
  accessCodeHash: string | null;
  requireConsent: boolean;
  consentText: string;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  collectEmployeeId: boolean;
  collectCustomerId: boolean;
  collectVendorId: boolean;
  collectOffice: boolean;
  collectDepartment: boolean;
  customIntakeFields: PowerFormCustomIntakeField[];
  defaultRecipientMappings: PowerFormRecipientMapping[];
  defaultFieldValues: Record<string, string>;
  submissionLimit: number | null;
  submissionCount: number;
  /** @deprecated legacy alias — prefer submissionCount */
  usageCount?: number;
  availableFrom: string | null;
  availableUntil: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  lastSubmissionAt: string | null;
};

export type PowerFormSubmissionRecord = {
  schemaVersion: number;
  id: string;
  powerFormId: string;
  officeId: string;
  envelopeId: string | null;
  submittedByName: string;
  submittedByEmail: string;
  submittedByPhone: string | null;
  intakeValues: Record<string, string>;
  status: PowerFormSubmissionStatus;
  startedAt: string;
  verifiedAt: string | null;
  envelopeCreatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  consentAcceptedAt: string | null;
  consentTextVersion: string | null;
  verificationAttemptCount: number;
  verificationLockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PowerFormAccessChallengeKind = "access_code" | "email_otp" | "invitation";

export type PowerFormAccessChallengeRecord = {
  schemaVersion: number;
  id: string;
  powerFormId: string;
  officeId: string;
  kind: PowerFormAccessChallengeKind;
  /** Hashed secret only — never store plaintext OTP/access codes/tokens. */
  secretHash: string;
  email: string | null;
  submissionId: string | null;
  attemptCount: number;
  lockedUntil: string | null;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PowerFormAnalyticsSnapshot = {
  schemaVersion: number;
  powerFormId: string;
  officeId: string;
  totalSubmissions: number;
  completedSubmissions: number;
  failedSubmissions: number;
  signingSubmissions: number;
  lastSubmissionAt: string | null;
  updatedAt: string;
};

export type WebFormRecord = {
  id: string;
  officeId: string;
  templateId: string;
  name: string;
  slug: string;
  status: PublishedFormStatus;
  instructions: string;
  createdByUserId: string | null;
  createdByEmail: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};
