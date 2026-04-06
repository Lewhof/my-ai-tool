export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'pin' | 'url' | 'textarea';
  maskType: string;
  placeholder?: string;
  required?: boolean;
}

export interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  fields: FieldDef[];
}

export const VAULT_CATEGORIES: CategoryDef[] = [
  {
    key: 'login',
    label: 'Login',
    icon: 'key',
    fields: [
      { key: 'username', label: 'Username / Email', type: 'text', maskType: 'default', placeholder: 'user@example.com' },
      { key: 'password', label: 'Password', type: 'password', maskType: 'password', required: true },
      { key: 'url', label: 'Website URL', type: 'url', maskType: 'default', placeholder: 'https://...' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'api_key',
    label: 'API Key',
    icon: 'code',
    fields: [
      { key: 'value', label: 'API Key / Token', type: 'password', maskType: 'default', required: true },
      { key: 'service', label: 'Service', type: 'text', maskType: 'default', placeholder: 'Anthropic, GitHub, etc.' },
      { key: 'environment', label: 'Environment', type: 'text', maskType: 'default', placeholder: 'production / development' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'bank_card',
    label: 'Bank Card',
    icon: 'credit-card',
    fields: [
      { key: 'card_name', label: 'Card Name', type: 'text', maskType: 'default', placeholder: 'Visa Gold', required: true },
      { key: 'number', label: 'Card Number', type: 'password', maskType: 'card_number', placeholder: '4532 xxxx xxxx xxxx' },
      { key: 'expiry', label: 'Expiry', type: 'text', maskType: 'default', placeholder: 'MM/YY' },
      { key: 'cvv', label: 'CVV', type: 'pin', maskType: 'cvv', placeholder: '***' },
      { key: 'pin', label: 'PIN', type: 'pin', maskType: 'pin', placeholder: '****' },
      { key: 'bank', label: 'Bank', type: 'text', maskType: 'default', placeholder: 'FNB, Standard Bank, etc.' },
    ],
  },
  {
    key: 'bank_account',
    label: 'Bank Account',
    icon: 'landmark',
    fields: [
      { key: 'bank', label: 'Bank', type: 'text', maskType: 'default', required: true },
      { key: 'holder', label: 'Account Holder', type: 'text', maskType: 'default' },
      { key: 'account_number', label: 'Account Number', type: 'password', maskType: 'default' },
      { key: 'branch', label: 'Branch / Swift Code', type: 'text', maskType: 'default' },
      { key: 'type', label: 'Account Type', type: 'text', maskType: 'default', placeholder: 'Cheque / Savings' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'identity',
    label: 'Identity',
    icon: 'fingerprint',
    fields: [
      { key: 'id_number', label: 'ID Number', type: 'password', maskType: 'default' },
      { key: 'passport', label: 'Passport Number', type: 'password', maskType: 'default' },
      { key: 'drivers', label: "Driver's License", type: 'password', maskType: 'default' },
      { key: 'tax', label: 'Tax Number', type: 'password', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'secure_note',
    label: 'Secure Note',
    icon: 'file-lock',
    fields: [
      { key: 'content', label: 'Content', type: 'textarea', maskType: 'password', required: true },
    ],
  },
  {
    key: 'wifi',
    label: 'Wi-Fi',
    icon: 'wifi',
    fields: [
      { key: 'network', label: 'Network Name (SSID)', type: 'text', maskType: 'default', required: true },
      { key: 'password', label: 'Password', type: 'password', maskType: 'password' },
      { key: 'security', label: 'Security Type', type: 'text', maskType: 'default', placeholder: 'WPA2 / WPA3' },
    ],
  },
  {
    key: 'server',
    label: 'Server / SSH',
    icon: 'server',
    fields: [
      { key: 'host', label: 'Host', type: 'text', maskType: 'default', required: true, placeholder: '192.168.1.1' },
      { key: 'port', label: 'Port', type: 'text', maskType: 'default', placeholder: '22' },
      { key: 'username', label: 'Username', type: 'text', maskType: 'default' },
      { key: 'password', label: 'Password / Key', type: 'password', maskType: 'password' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'crypto',
    label: 'Crypto Wallet',
    icon: 'bitcoin',
    fields: [
      { key: 'wallet_name', label: 'Wallet / Exchange', type: 'text', maskType: 'default', required: true },
      { key: 'seed', label: 'Seed Phrase', type: 'password', maskType: 'password' },
      { key: 'private_key', label: 'Private Key', type: 'password', maskType: 'default' },
      { key: 'address', label: 'Wallet Address', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: 'shield',
    fields: [
      { key: 'provider', label: 'Provider', type: 'text', maskType: 'default', required: true },
      { key: 'policy_number', label: 'Policy Number', type: 'password', maskType: 'default' },
      { key: 'type', label: 'Type', type: 'text', maskType: 'default', placeholder: 'Life / Medical / Vehicle' },
      { key: 'contact', label: 'Contact Number', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
];
