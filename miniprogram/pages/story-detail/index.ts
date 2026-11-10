import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent, PublicHomeModule } from '../../utils/content';
import { enableShareMenu } from '../../utils/share';
import { richTextHtml } from '../../utils/rich-text';

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
  detailCaptionLeftRichText?: string;
  detailCaptionRight?: string;
  detailCaptionRightRichText?: string;
  detailSource?: string;
  detailSourceRichText?: string;
  detailParagraph1?: string;
  detailParagraph1RichText?: string;
  detailParagraph2?: string;
  detailParagraph2RichText?: string;
  detailQuote?: string;
  detailQuoteRichText?: string;
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
    titleHtml: '',
    intro: '',
    introHtml: '',
    imageUrl: '',
    altText: '',
    captionLeft: issueTwoCopy.captionLeft,
    captionLeftHtml: richTextHtml('', issueTwoCopy.captionLeft),
    captionRight: issueTwoCopy.captionRight,
    captionRightHtml: richTextHtml('', issueTwoCopy.captionRight),
    source: issueTwoCopy.source,
    sourceHtml: richTextHtml('', issueTwoCopy.source),
    paragraph1: issueTwoCopy.paragraph1,
    paragraph1Html: richTextHtml('', issueTwoCopy.paragraph1),
    paragraph2: issueTwoCopy.paragraph2,
    paragraph2Html: richTextHtml('', issueTwoCopy.paragraph2),
    quote: issueTwoCopy.quote,
    quoteHtml: richTextHtml('', issueTwoCopy.quote),
    officialArticleUrl: '',
  },
  requestGeneration: 0,
  moduleId: 'story',
  requestedIssueCode: '',
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
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
      const detailFields = ['detailCaptionLeft', 'detailCaptionRight', 'detailSource', 'detailParagraph1', 'detailParagraph2', 'detailQuote', 'officialArticleUrl'];
      const hasDetailCopy = detailFields.some((field) => {
        const value = story[field];
        return typeof value === 'string' && value.trim().length > 0;
      }) || ['detailCaptionLeftRichText', 'detailCaptionRightRichText', 'detailSourceRichText', 'detailParagraph1RichText', 'detailParagraph2RichText', 'detailQuoteRichText']
        .some((field) => typeof story[field] === 'string' && String(story[field]).trim().length > 0);
      const fallback = isIssueTwo && !hasDetailCopy ? issueTwoCopy : { source: '', captionLeft: '', captionRight: '人物纪实', paragraph1: '', paragraph2: '', quote: '' };
      const title = String(opener?.title || issue.theme || '');
      const openerBody = String(opener?.body || '');
      const openerBodyRichText = typeof opener?.bodyRichText === 'string' ? opener.bodyRichText.trim() : '';
      const homeMetaRichText = typeof issue.homeMetaRichText === 'string' ? issue.homeMetaRichText.trim() : '';
      const introHtml = openerBodyRichText
        ? richTextHtml(openerBodyRichText, openerBody)
        : homeMetaRichText || richTextHtml('', openerBody);
      const captionLeft = String(story.detailCaptionLeft || fallback.captionLeft || story.captionLeft || '');
      const captionLeftRichText = String(story.detailCaptionLeftRichText || (story.detailCaptionLeft ? '' : story.captionLeftRichText || ''));
      const captionRight = String(story.detailCaptionRight || fallback.captionRight || '人物纪实');
      const source = String(story.detailSource || fallback.source);
      const paragraph1 = String(story.detailParagraph1 || fallback.paragraph1);
      const paragraph2 = String(story.detailParagraph2 || fallback.paragraph2);
      const quote = String(story.detailQuote || fallback.quote);
      this.setData({
        loading: false,
        error: '',
        issueCode: issueLabel(issue.code),
        title,
        titleHtml: richTextHtml(opener?.titleRichText, title),
        intro: openerBody,
        introHtml,
        imageUrl: String(story.imageUrl || ''),
        altText: String(story.altText || '本期人物图片'),
        captionLeft,
        captionLeftHtml: richTextHtml(captionLeftRichText, captionLeft),
        captionRight,
        captionRightHtml: richTextHtml(story.detailCaptionRightRichText, captionRight),
        source,
        sourceHtml: richTextHtml(story.detailSourceRichText, source),
        paragraph1,
        paragraph1Html: richTextHtml(story.detailParagraph1RichText, paragraph1),
        paragraph2,
        paragraph2Html: richTextHtml(story.detailParagraph2RichText, paragraph2),
        quote,
        quoteHtml: richTextHtml(story.detailQuoteRichText, quote),
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
