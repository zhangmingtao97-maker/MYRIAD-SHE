import { BadRequestException } from '@nestjs/common';

export interface ShippingAddress {
  userName: string;
  telNumber: string;
  provinceName: string;
  cityName: string;
  countyName: string;
  detailInfo: string;
  postalCode: string;
  nationalCode: string;
}

function text(value: unknown, label: string, maximum: number, required = true) {
  if (typeof value !== 'string') throw new BadRequestException(`${label}无效`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) throw new BadRequestException(`${label}无效`);
  return normalized;
}

export function normalizeShippingAddress(value: unknown): ShippingAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('收货地址格式无效');
  const source = value as Record<string, unknown>;
  const allowed = ['userName', 'telNumber', 'provinceName', 'cityName', 'countyName', 'detailInfo', 'postalCode', 'nationalCode'];
  if (Object.keys(source).some(key => !allowed.includes(key))) throw new BadRequestException('收货地址包含未知字段');
  const telNumber = text(source.telNumber, '收货人电话', 30);
  if (!/^[0-9+\-\s()]{5,30}$/.test(telNumber) || telNumber.replace(/\D/g, '').length < 5) throw new BadRequestException('收货人电话格式无效');
  const postalCode = text(source.postalCode ?? '', '邮政编码', 10, false);
  if (postalCode && !/^\d{5,10}$/.test(postalCode)) throw new BadRequestException('邮政编码格式无效');
  const nationalCode = text(source.nationalCode ?? '', '地区编码', 10, false);
  if (nationalCode && !/^\d{5,10}$/.test(nationalCode)) throw new BadRequestException('地区编码格式无效');
  return {
    userName: text(source.userName, '收货人姓名', 40), telNumber,
    provinceName: text(source.provinceName, '省份', 40), cityName: text(source.cityName, '城市', 40),
    countyName: text(source.countyName ?? '', '区县', 40, false), detailInfo: text(source.detailInfo, '详细地址', 200), postalCode, nationalCode,
  };
}
