import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent, PublicHomeModule } from '../../utils/content';

const issueTwoCopy = {
  source: '原载于 MYRIAD SHE 公众号·小程序策展节选',
  captionLeft: '时雨，拨于一个普通的下午',
  captionRight: '人物纪实',
  paragraph1: '她曾经很擅长处理危机。事情越急，她越冷静。可等到真正安全下来，她反而不知道该怎样度过一个没有警报的下午。',
  paragraph2: '时雨说，恢复不是某个醒来的瞬间，而是一连串很小的动作：放慢回消息的速度，不再为每一次拒绝寻找理由，允许自己在不知道答案的时候停停一会儿。',
  quote: '“我不是突然变得松弛。\n我只是终于承认，\n一直握紧也会疼。”',
};

type StoryModule = PublicHomeModule & {
  imageUrl?: string;
  detailCaptionLeft?: string;
  detailCaptionRight?: string;
  detailSource?: string;
  detailParagraph1?: string;
  detailParagraph2?: string;
  detailQuote?: string;
  officialArticleUrl?: string;
};

type OfficialArticleRuntime = typeof wx & {
  openOfficialAccountArticle?: (options: { url: string; fail?: (error: unknown) => void }) => void;
};

function issueLabel(code: string) {
  const number = code.replace(/^issue[\s_-]*/i, '').trim();
  return number ? `ISSUE ${number.toUpperCase()}` : 'ISSUE 02';
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issueCode: 'ISSUE 02',
    title: '',
    intro: '',
    imageUrl: '',
    altText: '',
    captionLeft: issueTwoCopy.captionLeft,
    captionRight: issueTwoCopy.captionRight,
    source: issueTwoCopy.source,
    paragraph1: issueTwoCopy.paragraph1,
    paragraph2: issueTwoCopy.paragraph2,
    quote: issueTwoCopy.quote,
    officialArticleUrl: '',
  },
  requestGeneration: 0,
  moduleId: 'story',
  requestedIssueCode: '',
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    this.moduleId = query.moduleId || 'story';
    this.requestedIssueCode = query.issueCode || '';
    void this.loadContent(this.requestedIssueCode);
  },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  onUnload() { this.requestGeneration += 1; },
  async loadContent(requestedIssueCode: string) {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const endpoint = requestedIssueCode ? `/content/archive/${encodeURIComponent(requestedIssueCode)}` : '/content/home';
      const data = await request<PublicHomeContent>(endpoint, { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('期刊内容格式无效');
      const issue = data.issue;
      if (!issue) throw new Error('当前暂无已发布期刊');
      const modules = (data.modules || []).filter((item) => item.enabled);
      const story = modules.find((item) => item.id === this.moduleId && item.type === 'story') as StoryModule | undefined;
      if (!story) throw new Error('当前期刊尚未开放人物故事');
      const coverStory = modules.find((item) => item.type === 'coverStory');
      const opener = coverStory || modules.find((item) => item.type === 'opener');
      const isIssueTwo = /^issue[\s_-]*0?2$/i.test(issue.code);
      const hasDetailCopy = ['detailCaptionLeft', 'detailCaptionRight', 'detailSource', 'detailParagraph1', 'detailParagraph2', 'detailQuote', 'officialArticleUrl']
        .some((field) => typeof story[field] === 'string');
      const fallback = isIssueTwo && !hasDetailCopy ? issueTwoCopy : { source: '', captionLeft: '', captionRight: '人物纪实', paragraph1: '', paragraph2: '', quote: '' };
      this.setData({
        loading: false,
        error: '',
        issueCode: issueLabel(issue.code),
        title: String(opener?.title || issue.theme || ''),
        intro: String(opener?.body || issue.homeMetaRichText || ''),
        imageUrl: String(story.imageUrl || ''),
        altText: String(story.altText || '本期人物纪实图片'),
        captionLeft: String(story.detailCaptionLeft || fallback.captionLeft || story.captionLeft || ''),
        captionRight: String(story.detailCaptionRight || fallback.captionRight || '人物纪实'),
        source: String(story.detailSource || fallback.source),
        paragraph1: String(story.detailParagraph1 || fallback.paragraph1),
        paragraph2: String(story.detailParagraph2 || fallback.paragraph2),
        quote: String(story.detailQuote || fallback.quote),
        officialArticleUrl: String(story.officialArticleUrl || ''),
      });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取人物故事') });
    }
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  backToIssue() { this.handleBack(); },
  openMore() { wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); },
  openOfficialArticle() {
    const url = this.data.officialArticleUrl;
    if (!url) {
      wx.showToast({ title: '公众号文章链接暂未配置', icon: 'none' });
      return;
    }
    const api = wx as OfficialArticleRuntime;
    if (!api.openOfficialAccountArticle) {
      wx.showToast({ title: '请更新微信后再打开公众号文章', icon: 'none' });
      return;
    }
    api.openOfficialAccountArticle({ url, fail: () => wx.showToast({ title: '暂时无法打开公众号文章', icon: 'none' }) });
  },
  onImageError() { this.setData({ imageUrl: '' }); },
  retry() { void this.loadContent(this.requestedIssueCode); },
  onShareAppMessage() {
    return { title: this.data.title ? `${this.data.title}｜人物故事` : '人物故事｜MYRIAD SHE', path: `/pages/story-detail/index?moduleId=${encodeURIComponent(this.moduleId)}` };
  },
  onShareTimeline() { return { title: this.data.title || '人物故事｜MYRIAD SHE' }; },
});

export {};
