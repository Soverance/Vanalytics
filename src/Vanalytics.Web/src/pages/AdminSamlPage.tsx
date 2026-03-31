import { SamlTab } from '@soverance/web'
import { getSamlConfig, updateSamlConfig, validateCertificate } from '../api/saml'

export default function AdminSamlPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">SAML Configuration</h1>
      <SamlTab
        getSamlConfig={getSamlConfig}
        updateSamlConfig={updateSamlConfig}
        validateCertificate={validateCertificate}
      />
    </div>
  )
}
