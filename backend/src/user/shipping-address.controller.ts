import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsObject, Min } from 'class-validator';
import type { Request } from 'express';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { ShippingAddressService } from './shipping-address.service';

class AddressVersionDto {
  @IsInt() @Min(0) version!: number;
}
class SaveShippingAddressDto extends AddressVersionDto {
  @IsObject() address!: Record<string, unknown>;
  @IsBoolean() isDefault!: boolean;
}
type UserRequest = Request & { user: { sub: string } };

@Controller('me/addresses')
@UseGuards(UserAuthGuard)
export class ShippingAddressController {
  constructor(private readonly addresses: ShippingAddressService) {}
  @Get() @Header('Cache-Control', 'no-store') list(@Req() request: UserRequest) { return this.addresses.list(request.user.sub); }
  @Post() @Header('Cache-Control', 'no-store') create(@Req() request: UserRequest, @Body() body: SaveShippingAddressDto) { return this.addresses.save(request.user.sub, body.version, body.address, body.isDefault); }
  @Patch(':id') @Header('Cache-Control', 'no-store') update(@Req() request: UserRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: SaveShippingAddressDto) { return this.addresses.save(request.user.sub, body.version, body.address, body.isDefault, id); }
  @Patch(':id/default') @Header('Cache-Control', 'no-store') setDefault(@Req() request: UserRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: AddressVersionDto) { return this.addresses.setDefault(request.user.sub, body.version, id); }
  @Delete(':id') @Header('Cache-Control', 'no-store') remove(@Req() request: UserRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: AddressVersionDto) { return this.addresses.remove(request.user.sub, body.version, id); }
}
