export interface ShippingAddress {
  userName: string; telNumber: string; provinceName: string; cityName: string; countyName: string;
  detailInfo: string; postalCode: string; nationalCode: string;
}
export interface AddressItem extends ShippingAddress { id: string; isDefault: boolean; createdAt: string }
export interface AddressBook { items: AddressItem[]; version: number; limit: number; savedId?: string }
export type AddressField = 'userName' | 'telNumber' | 'region' | 'detailInfo';

export function emptyShippingAddress(): ShippingAddress {
  return { userName: '', telNumber: '', provinceName: '', cityName: '', countyName: '', detailInfo: '', postalCode: '', nationalCode: '' };
}
export function addressFields(source: Partial<ShippingAddress>): ShippingAddress {
  const address = emptyShippingAddress();
  for (const key of Object.keys(address) as Array<keyof ShippingAddress>) address[key] = typeof source[key] === 'string' ? source[key]!.trim() : '';
  return address;
}
export function addressValidation(address: ShippingAddress): { field: AddressField; message: string } | null {
  if (!address.userName || address.userName.length > 40 || /[\u0000-\u001f\u007f]/.test(address.userName)) return { field: 'userName', message: '请填写 1–40 字的收件人姓名' };
  if (!/^[0-9+\-\s()]{5,30}$/.test(address.telNumber) || address.telNumber.replace(/\D/g, '').length < 5) return { field: 'telNumber', message: '请填写有效的联系电话' };
  if (!address.provinceName || !address.cityName || address.provinceName.length > 40 || address.cityName.length > 40 || address.countyName.length > 40) return { field: 'region', message: '请选择所在省、市、区' };
  if (!address.detailInfo || address.detailInfo.length > 200 || /[\u0000-\u001f\u007f]/.test(address.detailInfo)) return { field: 'detailInfo', message: '请填写 1–200 字的街道、门牌号等详细地址' };
  return null;
}
export function isAddressBook(value: unknown): value is AddressBook {
  if (!value || typeof value !== 'object') return false;
  const book = value as AddressBook;
  return Number.isSafeInteger(book.version) && book.version >= 0 && Number.isSafeInteger(book.limit) && book.limit > 0 && book.limit <= 50
    && Array.isArray(book.items) && book.items.length <= book.limit
    && book.items.every(item => item && /^[0-9a-f-]{36}$/i.test(item.id) && typeof item.isDefault === 'boolean' && typeof item.createdAt === 'string'
      && Object.keys(emptyShippingAddress()).every(key => typeof item[key as keyof ShippingAddress] === 'string') && !addressValidation(item))
    && new Set(book.items.map(item => item.id)).size === book.items.length
    && book.items.filter(item => item.isDefault).length === (book.items.length ? 1 : 0);
}
export function maskAddressPhone(phone: string) {
  return phone.length > 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone.replace(/.(?=.{2})/g, '*');
}
export function addressSummary(address: AddressItem) {
  return { id: address.id, userName: address.userName, maskedPhone: maskAddressPhone(address.telNumber), regionText: [address.provinceName, address.cityName, address.countyName].filter(Boolean).join(' '), detailInfo: address.detailInfo, isDefault: address.isDefault };
}
export function addressImportError(error: { errMsg?: string; errno?: number }) {
  const reason = String(error.errMsg || '');
  if (/cancel/i.test(reason)) return null;
  if (error.errno === 112 || /api scope is not declared|appid privacy api banned|no permission|not in requiredPrivateInfos/i.test(reason)) return '微信地址导入暂不可用，你仍可手动填写并保存地址。';
  if (/privacy|auth deny|authorize|authorization/i.test(reason)) return '请同意微信隐私授权后重试，也可以手动填写地址。';
  return '微信地址暂时无法打开，你可以稍后重试或手动填写。';
}
