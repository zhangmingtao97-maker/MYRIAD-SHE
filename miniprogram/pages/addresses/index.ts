import { apiErrorMessage, request } from '../../utils/request';
import { addressFields, addressImportError, addressSummary, addressValidation, emptyShippingAddress, isAddressBook, type AddressBook, type AddressField } from '../../utils/shipping-address';

const app = getApp<IAppOption>();
Page({
  data: {
    statusBarHeight: 0, navSideWidth: 90, view: 'list' as 'list' | 'edit' | 'success', loading: true, saving: false, importing: false,
    error: '', importError: '', conflict: false, bookReady: false, regionLabel: '', limit: 10, busyId: '', items: [] as ReturnType<typeof addressSummary>[],
    form: emptyShippingAddress(), region: [] as string[], editingId: '', isDefault: false, dirty: false,
    fieldError: '', errorField: '' as AddressField | '', focusField: '', saved: null as ReturnType<typeof addressSummary> | null,
  },
  book: null as AddressBook | null,
  session: '',
  active: true,
  generation: 0,
  confirming: false,
  initialForm: '',
  onLoad() {
    const info = wx.getWindowInfo();
    const capsule = wx.getMenuButtonBoundingClientRect();
    this.setData({ statusBarHeight: info.statusBarHeight, navSideWidth: Math.max(80, info.windowWidth - capsule.left + 12) });
  },
  onShow() {
    if (!app.globalData.accessToken || app.globalData.accountDeleted) { this.leavePage(); return; }
    const session = `${app.globalData.userId}:${app.globalData.authGeneration}`;
    if (session !== this.session) {
      this.generation += 1; this.book = null; this.session = session; this.confirming = false;
      this.setData({ view: 'list', bookReady: false, regionLabel: '', items: [], saved: null, form: emptyShippingAddress(), editingId: '', dirty: false, loading: true, saving: false, importing: false, busyId: '', error: '', importError: '', conflict: false });
      void this.loadAddresses();
    }
  },
  onUnload() { this.active = false; this.generation += 1; this.book = null; },
  current(generation = this.generation) {
    return this.active && generation === this.generation && this.session === `${app.globalData.userId}:${app.globalData.authGeneration}` && Boolean(app.globalData.accessToken) && !app.globalData.accountDeleted;
  },
  reconcileSession() {
    // An automatic token refresh can establish a different account while a request is pending.
    if (this.active && this.session !== `${app.globalData.userId}:${app.globalData.authGeneration}`) this.onShow();
  },
  applyBook(book: AddressBook) {
    this.book = book;
    this.setData({ bookReady: true, items: [...book.items].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map(addressSummary), limit: book.limit });
  },
  async loadAddresses() {
    if (this.data.saving || this.data.importing || !this.current()) return;
    const generation = ++this.generation;
    this.setData({ loading: !this.book, error: '' });
    try {
      const book = await request<AddressBook>('/me/addresses');
      if (!this.current(generation)) return;
      if (!isAddressBook(book)) throw new Error('地址列表格式无效');
      this.applyBook(book);
      this.setData({ conflict: false });
      if (this.data.view === 'edit' && this.data.editingId && !book.items.some(item => item.id === this.data.editingId)) {
        this.setData({ editingId: '', error: '原地址已被删除，当前填写的内容可以保存为新地址。' });
      }
    } catch (caught) {
      if (this.current(generation)) this.setData({ error: apiErrorMessage(caught, '地址暂时无法读取，请重试') });
    } finally { if (this.current(generation)) this.setData({ loading: false }); this.reconcileSession(); }
  },
  busy() { return this.data.saving || this.data.importing || Boolean(this.data.busyId) || this.data.loading; },
  openEditor(event?: WechatMiniprogram.CustomEvent) {
    if (this.busy() || !this.book || !this.current()) return;
    const id = String(event?.currentTarget?.dataset?.id || '');
    const item = id ? this.book.items.find(address => address.id === id) : undefined;
    if (id && !item) return;
    if (!item && this.book.items.length >= this.book.limit) { this.setData({ error: `最多保存 ${this.book.limit} 个地址，请先编辑或删除已有地址。` }); return; }
    const form = item ? addressFields(item) : emptyShippingAddress();
    const isDefault = item ? item.isDefault : !this.book.items.length;
    this.initialForm = JSON.stringify({ form, isDefault });
    this.setData({ view: 'edit', editingId: item?.id || '', form, isDefault, region: form.provinceName ? [form.provinceName, form.cityName, form.countyName] : [], regionLabel: [form.provinceName, form.cityName, form.countyName].filter(Boolean).join(' '), dirty: false, error: '', fieldError: '', errorField: '', focusField: '', saved: null, importError: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  markDirty() {
    const dirty = JSON.stringify({ form: this.data.form, isDefault: this.data.isDefault }) !== this.initialForm;
    this.setData({ dirty });
    if (dirty && typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: '地址尚未保存，确定离开吗？' });
    else this.clearLeaveAlert();
  },
  clearLeaveAlert() { if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload({}); },
  onFieldInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (this.busy()) return;
    const field = event.currentTarget.dataset.field as AddressField;
    if (!['userName', 'telNumber', 'detailInfo'].includes(field)) return;
    this.setData({ [`form.${field}`]: event.detail.value, fieldError: '', errorField: '', focusField: '' });
    this.markDirty();
  },
  onRegionChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    if (this.busy()) return;
    const region = event.detail.value;
    if (!Array.isArray(region) || region.length !== 3 || !region.every(value => typeof value === 'string')) return;
    this.setData({ region, regionLabel: region.join(' '), 'form.provinceName': region[0], 'form.cityName': region[1], 'form.countyName': region[2], 'form.nationalCode': '', 'form.postalCode': '', fieldError: '', errorField: '' });
    this.markDirty();
  },
  onDefaultChange(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    if (this.busy()) return;
    this.setData({ isDefault: Boolean(event.detail.value) }); this.markDirty();
  },
  async saveAddress() {
    if (this.busy() || !this.book || this.data.conflict || !this.current()) return;
    const address = addressFields(this.data.form);
    const invalid = addressValidation(address);
    if (invalid) { this.setData({ fieldError: invalid.message, errorField: invalid.field, focusField: invalid.field }); return; }
    const generation = this.generation;
    const id = this.data.editingId;
    this.setData({ saving: true, error: '', fieldError: '', focusField: '' });
    try {
      const book = await request<AddressBook>(`/me/addresses${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', data: { version: this.book.version, address, isDefault: this.data.isDefault } });
      if (!this.current(generation)) return;
      if (!isAddressBook(book)) throw new Error('保存结果无法确认，请重新读取地址列表');
      const saved = book.items.find(item => item.id === book.savedId);
      if (!saved) throw new Error('保存结果无法确认，请重新读取地址列表');
      this.applyBook(book); this.clearLeaveAlert();
      this.setData({ view: 'success', saved: addressSummary(saved), dirty: false, form: emptyShippingAddress(), region: [], editingId: '', importError: '' });
      wx.hideKeyboard(); wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (caught) { if (this.current(generation)) this.mutationError(caught, '地址暂时无法保存，填写内容已保留'); }
    finally { if (this.current(generation)) this.setData({ saving: false }); this.reconcileSession(); }
  },
  mutationError(caught: unknown, fallback: string) {
    const conflict = Boolean(caught && typeof caught === 'object' && (caught as { statusCode?: number }).statusCode === 409);
    this.setData({ error: apiErrorMessage(caught, fallback), conflict });
  },
  async setDefault(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (this.busy() || !this.book || this.data.conflict || !this.current() || !this.book.items.some(item => item.id === id && !item.isDefault)) return;
    await this.changeList(id, 'PATCH', `/${id}/default`);
  },
  removeAddress(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (this.busy() || !this.book || this.data.conflict || this.confirming || !this.current() || !this.book.items.some(item => item.id === id)) return;
    const generation = this.generation;
    this.confirming = true;
    wx.showModal({ title: '删除这个地址？', content: '删除后将不再出现在你的收货地址中。', confirmText: '删除', confirmColor: '#663124', success: result => {
      this.confirming = false;
      if (result.confirm && this.current(generation)) void this.changeList(id, 'DELETE', `/${id}`);
    }, fail: () => { this.confirming = false; } });
  },
  async changeList(id: string, method: 'PATCH' | 'DELETE', suffix: string) {
    if (!this.book || this.busy() || !this.current()) return;
    const generation = this.generation;
    this.setData({ busyId: id, error: '' });
    try {
      const book = await request<AddressBook>(`/me/addresses${suffix}`, { method, data: { version: this.book.version } });
      if (!this.current(generation)) return;
      if (!isAddressBook(book)) throw new Error('更新结果无法确认，请重新读取地址列表');
      this.applyBook(book);
      wx.showToast({ title: method === 'DELETE' ? '地址已删除' : '默认地址已更新', icon: 'success' });
    } catch (caught) { if (this.current(generation)) this.mutationError(caught, '地址暂时无法更新，请重试'); }
    finally { if (this.current(generation)) this.setData({ busyId: '' }); this.reconcileSession(); }
  },
  importWechatAddress() {
    if (this.busy() || !this.book || !this.current()) return;
    if (this.data.view !== 'edit' && this.book.items.length >= this.book.limit) { this.setData({ error: `最多保存 ${this.book.limit} 个地址，请先编辑或删除已有地址。` }); return; }
    if (this.data.view === 'edit' && this.data.dirty) {
      if (this.confirming) return;
      const generation = this.generation;
      this.confirming = true;
      wx.showModal({ title: '使用微信地址？', content: '导入后会替换当前填写的信息，仍需你点击保存。', confirmText: '继续导入', success: result => { this.confirming = false; if (result.confirm && this.current(generation)) this.chooseWechatAddress(); }, fail: () => { this.confirming = false; } });
      return;
    }
    this.chooseWechatAddress();
  },
  chooseWechatAddress() {
    if (this.busy() || !this.current()) return;
    const generation = this.generation;
    this.setData({ importing: true, importError: '' });
    wx.chooseAddress({
      success: result => {
        if (!this.current(generation)) return;
        const form = addressFields(result);
        if (this.data.view !== 'edit') {
          this.initialForm = JSON.stringify({ form: emptyShippingAddress(), isDefault: !this.book?.items.length });
          this.setData({ editingId: '', isDefault: !this.book?.items.length });
        }
        this.setData({ view: 'edit', importing: false, form, region: [form.provinceName, form.cityName, form.countyName], regionLabel: [form.provinceName, form.cityName, form.countyName].filter(Boolean).join(' '), fieldError: '', errorField: '', error: '' });
        this.markDirty(); wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      },
      fail: error => {
        if (!this.current(generation)) return;
        const message = addressImportError(error);
        if (message) console.warn('[addresses] chooseAddress failed', { errMsg: error.errMsg, errno: (error as { errno?: number }).errno });
        this.setData({ importing: false, importError: message || '' });
      },
    });
  },
  showList() {
    if (this.busy()) return;
    this.clearLeaveAlert();
    this.setData({ view: 'list', dirty: false, form: emptyShippingAddress(), region: [], editingId: '', fieldError: '', errorField: '', importError: '', saved: null });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  handleBack() {
    if (this.busy() || this.confirming) return;
    if (this.data.view === 'edit' && this.data.dirty) {
      const generation = this.generation; this.confirming = true;
      wx.showModal({ title: '放弃当前填写？', content: '离开后，尚未保存的地址信息不会保留。', confirmText: '放弃填写', success: result => { this.confirming = false; if (result.confirm && this.current(generation)) this.showList(); }, fail: () => { this.confirming = false; } });
    } else if (this.data.view !== 'list') this.showList();
    else this.leavePage();
  },
  leavePage() { this.clearLeaveAlert(); wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/mine/index' }) }); },
});
