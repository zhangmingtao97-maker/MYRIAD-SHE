import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { AuditService } from '../admin/audit.service';
import { accountDeletedException } from '../auth/auth-errors';
import { normalizeShippingAddress, type ShippingAddress } from './shipping-address';

type AddressItem = ShippingAddress & { id: string; isDefault: boolean; createdAt: string };
type AddressRow = { id: string; addressEncrypted: unknown; isDefault: boolean; createdAt: string };
export const maximumShippingAddresses = 10;

@Injectable()
export class ShippingAddressService {
  constructor(private readonly database: DatabaseService, private readonly encryption: DataEncryptionService, private readonly audit: AuditService) {}

  private async items(client: PoolClient, userId: string): Promise<AddressItem[]> {
    const result = await client.query<AddressRow>(
      `select id, address_encrypted as "addressEncrypted", is_default as "isDefault", created_at as "createdAt"
       from user_shipping_addresses where user_id = $1 order by created_at, id`, [userId],
    );
    try {
      return result.rows.map(row => ({ ...normalizeShippingAddress(this.encryption.decryptJson(row.addressEncrypted, 'user.address')), id: row.id, isDefault: row.isDefault, createdAt: row.createdAt }));
    } catch { throw new InternalServerErrorException('收货地址暂时无法读取，请稍后重试'); }
  }

  async list(userId: string, transaction?: PoolClient) {
    const read = async (client: PoolClient) => {
      const user = await client.query<{ version: number }>(`select shipping_address_revision as version from users where id = $1 for share`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      return { items: await this.items(client, userId), version: user.rows[0].version, limit: maximumShippingAddresses };
    };
    return transaction ? read(transaction) : this.database.withTransaction(read);
  }

  private async change(userId: string, expectedVersion: number | undefined, operation: (items: AddressItem[]) => string | undefined) {
    return this.database.withTransaction(async client => {
      // Serialize address changes and account deletion under the same user lock.
      const user = await client.query<{ version: number }>(`select shipping_address_revision as version from users where id = $1 for update`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      const version = user.rows[0].version;
      if (expectedVersion !== undefined && expectedVersion !== version) throw new ConflictException('地址已在其他页面更新，请重新加载后再保存');
      const items = await this.items(client, userId);
      const savedId = operation(items);
      if (items.length > maximumShippingAddresses) throw new BadRequestException(`最多保存 ${maximumShippingAddresses} 个地址`);
      if (items.length && !items.some(item => item.isDefault)) items[0].isDefault = true;
      if (items.filter(item => item.isDefault).length > 1) throw new BadRequestException('只能设置一个默认地址');
      await client.query('delete from user_shipping_addresses where user_id = $1', [userId]);
      let defaultEncrypted: string | null = null;
      for (const item of items) {
        const { id, isDefault, createdAt, ...address } = item;
        const encrypted = JSON.stringify(this.encryption.encryptJson(address, 'user.address'));
        await client.query(`insert into user_shipping_addresses(id, user_id, address_encrypted, is_default, created_at) values ($1, $2, $3::jsonb, $4, $5)`, [id, userId, encrypted, isDefault, createdAt]);
        if (isDefault) defaultEncrypted = encrypted;
      }
      await client.query(`update users set shipping_address_encrypted = $1::jsonb, shipping_address_revision = shipping_address_revision + 1, updated_at = now() where id = $2`, [defaultEncrypted, userId]);
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'user.address.updated', resourceType: 'user_profile', resourceId: userId, metadata: { fields: ['shipping_address'], count: items.length } }, client);
      return { items, version: version + 1, limit: maximumShippingAddresses, ...(savedId ? { savedId } : {}) };
    });
  }

  save(userId: string, version: number, value: unknown, isDefault: boolean, id?: string) {
    const address = normalizeShippingAddress(value);
    return this.change(userId, version, items => {
      const existing = id ? items.find(item => item.id === id) : undefined;
      if (id && !existing) throw new NotFoundException('地址不存在或已删除，请重新加载');
      if (isDefault) items.forEach(item => { item.isDefault = false; });
      if (existing) Object.assign(existing, address, { isDefault });
      else items.push({ ...address, id: randomUUID(), isDefault: isDefault || items.length === 0, createdAt: new Date().toISOString() });
      // Turning off the default in the editor selects another saved address when available.
      if (!isDefault && existing && !items.some(item => item.isDefault)) (items.find(item => item !== existing) || existing).isDefault = true;
      return existing?.id || items[items.length - 1].id;
    });
  }

  setDefault(userId: string, version: number, id: string) {
    return this.change(userId, version, items => {
      if (!items.some(item => item.id === id)) throw new NotFoundException('地址不存在或已删除，请重新加载');
      items.forEach(item => { item.isDefault = item.id === id; });
      return id;
    });
  }

  remove(userId: string, version: number, id: string) {
    return this.change(userId, version, items => {
      const index = items.findIndex(item => item.id === id);
      if (index < 0) throw new NotFoundException('地址不存在或已删除，请重新加载');
      items.splice(index, 1);
      return undefined;
    });
  }

  replaceLegacy(userId: string, value: unknown) {
    const address = normalizeShippingAddress(value);
    return this.change(userId, undefined, items => {
      const existing = items.find(item => item.isDefault);
      if (existing) Object.assign(existing, address);
      else items.push({ ...address, id: randomUUID(), isDefault: true, createdAt: new Date().toISOString() });
      return undefined;
    });
  }
}
