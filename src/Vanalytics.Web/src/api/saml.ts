import { api } from './client'
import type {
  SamlConfigResponse,
  SamlConfigUpdateRequest,
  CertificateValidateRequest,
  CertificateValidateResponse,
  SamlStatusResponse,
} from '@soverance/web'

export type { SamlConfigResponse, SamlConfigUpdateRequest, CertificateValidateRequest, CertificateValidateResponse, SamlStatusResponse }

export function getSamlConfig() {
  return api<SamlConfigResponse>('/api/admin/saml')
}

export function updateSamlConfig(data: SamlConfigUpdateRequest) {
  return api<void>('/api/admin/saml', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function validateCertificate(data: CertificateValidateRequest) {
  return api<CertificateValidateResponse>('/api/admin/saml/validate-certificate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getSamlStatus() {
  return api<SamlStatusResponse>('/api/auth/saml/status')
}
