import { apiClient } from "./client";
import type {
  Nominee,
  NomineeCase,
  NomineeMedicalHold,
  ToggleNomineeMedicalHoldPayload,
  ReleasedDocItem,
} from "@/types";

// ---- Owner nominee management ----------------------------------------------

export function fetchNominee(): Promise<Nominee | null> {
  return apiClient.get<Nominee | null>("/api/nominee");
}

export function fetchNominees(): Promise<Nominee[]> {
  return apiClient.get<Nominee[]>("/api/nominee/list");
}

export function saveNominee(name: string, email: string): Promise<Nominee> {
  return apiClient.post<Nominee>("/api/nominee", { name, email });
}

export function updateNominee(name: string, email: string, nomineeId?: string): Promise<Nominee> {
  if (nomineeId) {
    return apiClient.patch<Nominee>(`/api/nominee/${nomineeId}`, { name, email });
  }
  return apiClient.patch<Nominee>("/api/nominee", { name, email });
}

export function removeNominee(nomineeId?: string): Promise<void> {
  if (nomineeId) {
    return apiClient.delete<void>(`/api/nominee/${nomineeId}`);
  }
  return apiClient.delete<void>("/api/nominee");
}

export function sendNomineeInvitation(nomineeId?: string): Promise<Nominee> {
  if (nomineeId) {
    return apiClient.post<Nominee>(`/api/nominee/${nomineeId}/invite`);
  }
  return apiClient.post<Nominee>("/api/nominee/invite");
}

// ---- Nominee medical hold ---------------------------------------------------

export function fetchNomineeMedicalHold(): Promise<NomineeMedicalHold> {
  return apiClient.get<NomineeMedicalHold>("/api/nominee/medical-hold");
}

export function toggleNomineeMedicalHold(payload: ToggleNomineeMedicalHoldPayload): Promise<NomineeMedicalHold> {
  return apiClient.post<NomineeMedicalHold>("/api/nominee/medical-hold", payload);
}

// ---- Nominee released documents & fast-track verification -------------------

export function fetchNomineeReleasedDocuments(): Promise<ReleasedDocItem[]> {
  return apiClient.get<ReleasedDocItem[]>("/api/nominee/documents");
}

export function fastTrackApproveNomineeCase(): Promise<NomineeCase> {
  return apiClient.post<NomineeCase>("/api/nominee/case/fast-track-approve");
}

// ---- Nominee portal ---------------------------------------------------------

export function fetchNomineeCase(): Promise<NomineeCase> {
  return apiClient.get<NomineeCase>("/api/nominee/case");
}

export interface InitiateClaimParams {
  claim_reason: string;
  incident_date?: string;
  jurisdiction?: string;
  note?: string;
  declaration_confirmed: boolean;
}

export function initiateNomineeClaim(params: InitiateClaimParams): Promise<NomineeCase> {
  return apiClient.post<NomineeCase>("/api/nominee/case/claim", params);
}

export interface SubmitEvidenceParams {
  file: File;
  category?: string;
  document_number?: string;
  issuing_authority?: string;
  note?: string;
}

export function submitNomineeEvidence(params: SubmitEvidenceParams | File, note?: string | undefined): Promise<NomineeCase> {
  const formData = new FormData();
  if (params instanceof File) {
    formData.append("file", params);
    if (note) formData.append("note", note);
  } else {
    formData.append("file", params.file);
    if (params.category) formData.append("category", params.category);
    if (params.document_number) formData.append("document_number", params.document_number);
    if (params.issuing_authority) formData.append("issuing_authority", params.issuing_authority);
    if (params.note) formData.append("note", params.note);
  }
  return apiClient.postForm<NomineeCase>("/api/nominee/case/evidence", formData);
}

export function deleteNomineeEvidence(evidenceId: string): Promise<NomineeCase> {
  return apiClient.delete<NomineeCase>(`/api/nominee/case/evidence/${evidenceId}`);
}
