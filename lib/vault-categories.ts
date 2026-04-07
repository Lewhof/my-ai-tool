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
  group?: string;
  fields: FieldDef[];
}

export const VAULT_CATEGORIES: CategoryDef[] = [
  // ── API & Dev ──
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
  // ── PINs ──
  {
    key: 'pin',
    label: 'PIN',
    icon: 'hash',
    fields: [
      { key: 'name', label: 'Name', type: 'text', maskType: 'default', required: true, placeholder: 'FNB Visa PIN' },
      { key: 'pin', label: 'PIN', type: 'pin', maskType: 'pin', required: true },
      { key: 'service', label: 'Bank / Service', type: 'text', maskType: 'default', placeholder: 'FNB, Alarm, etc.' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Membership ──
  {
    key: 'membership',
    label: 'Membership',
    icon: 'badge-check',
    fields: [
      { key: 'organisation', label: 'Organisation', type: 'text', maskType: 'default', required: true, placeholder: 'Gym, Medical Aid, etc.' },
      { key: 'member_number', label: 'Member Number', type: 'password', maskType: 'default' },
      { key: 'expiry', label: 'Expiry Date', type: 'text', maskType: 'default', placeholder: 'MM/YY or ongoing' },
      { key: 'contact', label: 'Contact', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Vehicle ──
  {
    key: 'vehicle',
    label: 'Vehicle',
    icon: 'car',
    fields: [
      { key: 'vehicle_name', label: 'Vehicle', type: 'text', maskType: 'default', required: true, placeholder: 'BMW 320i' },
      { key: 'registration', label: 'Registration', type: 'text', maskType: 'default', placeholder: 'GP 123 ABC' },
      { key: 'vin', label: 'VIN Number', type: 'password', maskType: 'default' },
      { key: 'license_expiry', label: 'License Expiry', type: 'text', maskType: 'default', placeholder: 'MM/YY' },
      { key: 'tracker_pin', label: 'Tracker PIN', type: 'pin', maskType: 'pin' },
      { key: 'insurance_policy', label: 'Insurance Policy #', type: 'password', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Subscription ──
  {
    key: 'subscription',
    label: 'Subscription',
    icon: 'repeat',
    fields: [
      { key: 'service', label: 'Service', type: 'text', maskType: 'default', required: true, placeholder: 'Netflix, Spotify, etc.' },
      { key: 'username', label: 'Username / Email', type: 'text', maskType: 'default' },
      { key: 'password', label: 'Password', type: 'password', maskType: 'password' },
      { key: 'plan', label: 'Plan', type: 'text', maskType: 'default', placeholder: 'Premium / Family' },
      { key: 'billing_date', label: 'Billing Date', type: 'text', maskType: 'default', placeholder: '1st of month' },
      { key: 'cost', label: 'Monthly Cost', type: 'text', maskType: 'default', placeholder: 'R199' },
      { key: 'url', label: 'URL', type: 'url', maskType: 'default', placeholder: 'https://...' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Financial ──
  {
    key: 'bank_card',
    label: 'Bank Card',
    icon: 'credit-card',
    group: 'Financial',
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
    group: 'Financial',
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
    key: 'investment',
    label: 'Investment',
    icon: 'trending-up',
    group: 'Financial',
    fields: [
      { key: 'platform', label: 'Platform / Provider', type: 'text', maskType: 'default', required: true, placeholder: 'EasyEquities, Allan Gray, etc.' },
      { key: 'account_number', label: 'Account Number', type: 'password', maskType: 'default' },
      { key: 'username', label: 'Login', type: 'text', maskType: 'default' },
      { key: 'password', label: 'Password', type: 'password', maskType: 'password' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: 'shield',
    group: 'Financial',
    fields: [
      { key: 'provider', label: 'Provider', type: 'text', maskType: 'default', required: true },
      { key: 'policy_number', label: 'Policy Number', type: 'password', maskType: 'default' },
      { key: 'type', label: 'Type', type: 'text', maskType: 'default', placeholder: 'Life / Medical / Vehicle / Property' },
      { key: 'premium', label: 'Monthly Premium', type: 'text', maskType: 'default', placeholder: 'R500' },
      { key: 'contact', label: 'Contact', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'tax',
    label: 'Tax',
    icon: 'file-text',
    group: 'Financial',
    fields: [
      { key: 'tax_number', label: 'Tax Number', type: 'password', maskType: 'default', required: true },
      { key: 'efiling_login', label: 'eFiling Username', type: 'text', maskType: 'default' },
      { key: 'efiling_password', label: 'eFiling Password', type: 'password', maskType: 'password' },
      { key: 'practitioner', label: 'Tax Practitioner', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Property ──
  {
    key: 'property_bond',
    label: 'Bond',
    icon: 'home',
    group: 'Property',
    fields: [
      { key: 'bank', label: 'Bank', type: 'text', maskType: 'default', required: true },
      { key: 'account_number', label: 'Bond Account Number', type: 'password', maskType: 'default' },
      { key: 'address', label: 'Property Address', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'property_levy',
    label: 'Levy',
    icon: 'building',
    group: 'Property',
    fields: [
      { key: 'body_corporate', label: 'Body Corporate / HOA', type: 'text', maskType: 'default', required: true },
      { key: 'account', label: 'Account Number', type: 'password', maskType: 'default' },
      { key: 'contact', label: 'Contact', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'property_access',
    label: 'Access Codes',
    icon: 'door-open',
    group: 'Property',
    fields: [
      { key: 'property', label: 'Property / Location', type: 'text', maskType: 'default', required: true },
      { key: 'gate_code', label: 'Gate Code', type: 'pin', maskType: 'pin' },
      { key: 'remote_code', label: 'Remote / Frequency', type: 'text', maskType: 'default' },
      { key: 'guard_contact', label: 'Guard / Security Contact', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  {
    key: 'property_utility',
    label: 'Utilities',
    icon: 'plug',
    group: 'Property',
    fields: [
      { key: 'provider', label: 'Provider', type: 'text', maskType: 'default', required: true, placeholder: 'Eskom, City of Joburg, Vumatel, etc.' },
      { key: 'account_number', label: 'Account Number', type: 'password', maskType: 'default' },
      { key: 'meter_number', label: 'Meter Number', type: 'text', maskType: 'default' },
      { key: 'notes', label: 'Notes', type: 'textarea', maskType: 'default' },
    ],
  },
  // ── Identity & Auth ──
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
];
