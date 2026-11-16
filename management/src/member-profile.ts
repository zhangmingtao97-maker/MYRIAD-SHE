export type MemberAddress = {
  userName: string;
  telNumber: string;
  provinceName: string;
  cityName: string;
  countyName: string;
  detailInfo: string;
  postalCode?: string;
  nationalCode?: string;
};

export type Member = {
  id: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
  observationCount: number;
  nickname: string | null;
  avatarUrl: string | null;
  phoneMasked: string | null;
  phoneNumber?: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  address?: MemberAddress | null;
};

export type MemberDetail = Member & {
  openId: string;
  maskedUnionId: string | null;
  privacyRequests: Array<{ id: string; status: string; requestedAt: string; scheduledFor: string }>;
};
