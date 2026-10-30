import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { PoolClient } from 'pg';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../admin/audit.service';
import { RedisService } from '../cache/redis.service';
import { parseDatabaseCount, parsePagination } from '../pagination';
import { defaultDiscussionContent, DiscussionContent, validateDiscussionContent } from './discussion-content';

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedAudioTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
type PracticeEntryKey = string;

interface PublicHomeResponse {
  issue: { code: string; label: string; month: string; theme: string; question: string; microVoiceTitle: string | null; microVoiceDuration: string | null; homeMetaRichText: string; homeMetaFontSize: number; homeMetaColor: string; homeCoverCaptionLeft: string; homeCoverCaptionRight: string } | null;
  question: string;
  coverUrl: string;
  microVoice: { title: string; duration: string; url: string; enabled: boolean };
  sections: string[];
  publishedVersion: number;
  modules: Array<Record<string, unknown>>;
}

interface PublicHomeCache {
  issue: {
    code: string;
    label: string;
    month: string;
    theme: string;
    question: string;
    microVoiceTitle: string | null;
    microVoiceDuration: string | null;
    homeMetaRichText: string;
    homeMetaFontSize: number;
    homeMetaColor: string;
    homeCoverCaptionLeft: string;
    homeCoverCaptionRight: string;
    coverObjectKey: string | null;
    microVoiceObjectKey: string | null;
  } | null;
  question: string;
  sections: string[];
  publishedVersion: number;
  modules: Array<Record<string, unknown>>;
}

const issueModuleTypes = ['issueMeta', 'coverStory', 'cover', 'opener', 'story', 'storyAction', 'image', 'quote', 'audio', 'question', 'observationAction', 'sharedPracticeAction', 'contents', 'archive', 'brandFooter'] as const;
type IssueModuleType = typeof issueModuleTypes[number];
interface IssueAudioTrack { id: string; title: string; duration: string; audioObjectKey: string; quote: string; subtitle: string; transcript: string }
interface IssueModule { id: string; type: IssueModuleType; order: number; enabled: boolean; tracks?: IssueAudioTrack[]; [key: string]: unknown }
interface IssueDraftContent { sections: IssueModule[]; discussion: DiscussionContent }

class IssueDto {
  @IsString() @MinLength(2) @MaxLength(64) code!: string;
  @IsString() @MinLength(2) @MaxLength(80) label!: string;
  @IsString() @MinLength(2) @MaxLength(40) month!: string;
  @IsString() @MinLength(2) @MaxLength(200) theme!: string;
  @IsString() @MinLength(2) @MaxLength(500) question!: string;
  @IsOptional() @IsString() @MaxLength(120) microVoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(20) microVoiceDuration?: string;
  @IsOptional() @IsString() @MaxLength(512) coverObjectKey?: string;
  @IsOptional() @IsString() @MaxLength(512) microVoiceObjectKey?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(2000) homeMetaRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(12) @Max(48) homeMetaFontSize?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) homeMetaColor?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionLeft?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionRight?: string;
  @IsOptional() @IsObject() draftContent?: IssueDraftContent;
}

class UpdateIssueDto {
  @IsInt() @Min(1) editVersion!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(64) code?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(80) label?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(40) month?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(200) theme?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(500) question?: string;
  @IsOptional() @IsString() @MaxLength(120) microVoiceTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(20) microVoiceDuration?: string | null;
  @IsOptional() @IsString() @MaxLength(512) coverObjectKey?: string | null;
  @IsOptional() @IsString() @MaxLength(512) microVoiceObjectKey?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(2000) homeMetaRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(12) @Max(48) homeMetaFontSize?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) homeMetaColor?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionLeft?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionRight?: string;
  @IsOptional() @IsObject() draftContent?: IssueDraftContent;
}

class MediaUploadDto {
  @IsString() @MinLength(1) @MaxLength(200) fileName!: string;
  @IsString() @MinLength(1) @MaxLength(100) contentType!: string;
  @IsInt() @Min(1) fileSize!: number;
  @IsIn(['image', 'audio']) kind!: 'image' | 'audio';
}

class MediaDeleteDto {
  @IsString() @MaxLength(512) objectKey!: string;
  @IsIn(['orphan', 'temporary']) purpose!: 'orphan' | 'temporary';
  @IsOptional() @IsString() @MaxLength(4096) cleanupToken?: string;
}

class PracticeEntryDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,63}$/) key!: PracticeEntryKey;
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(240) description!: string;
  @IsOptional() @IsString() @MaxLength(2000) contextRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) contextFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) contextColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) titleRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) titleFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) titleColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) descriptionRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) descriptionFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) descriptionColor?: string;
  @IsBoolean() enabled!: boolean;
}

class ObservationCopyItemDto {
  @IsString() @MaxLength(2000) richText!: string;
  @IsInt() @Min(10) @Max(48) fontSize!: number;
  @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color!: string;
}

class ObservationCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) introTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) introDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityContext?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonContext?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonGuide?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyCopy?: ObservationCopyItemDto;
}

class SharedPracticeCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) topbarTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroIntro?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineContext?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineIssueLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineIssueTheme?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineQuestion?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineContext?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) noticeLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) noticeCode?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) nextAction?: ObservationCopyItemDto;
}

class PrivacyPageCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) topbarTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroIntro?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyStatus?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localConfirm?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) footerCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) policyTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) policyCopy?: ObservationCopyItemDto;
}

class PrivacyPageContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsObject() @ValidateNested() @Type(() => PrivacyPageCopyDto) copy!: PrivacyPageCopyDto;
}

class AboutPageDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(6000) brandIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) contentSources!: string;
  @IsString() @MinLength(1) @MaxLength(6000) contactInfo!: string;
}

class PracticeContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) titleRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) titleFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) titleColor?: string;
  @IsString() @MinLength(1) @MaxLength(240) intro!: string;
  @IsOptional() @IsString() @MaxLength(2000) introRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) introFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) introColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) metaLeftRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) metaLeftFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) metaLeftColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) metaRightRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) metaRightFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) metaRightColor?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyDto) observationCopy?: ObservationCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SharedPracticeCopyDto) sharedPracticeCopy?: SharedPracticeCopyDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PracticeEntryDto) entries!: PracticeEntryDto[];
}

class DailyObjectProductDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,31}$/) id!: string;
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(80) english!: string;
  @IsString() @MinLength(1) @MaxLength(2048) image!: string;
  @IsString() @MaxLength(40) price!: string;
  @IsString() @MaxLength(80) priceLabel!: string;
  @IsString() @MinLength(1) @MaxLength(1000) description!: string;
  @IsString() @MaxLength(1000) optionDetails!: string;
  @IsString() @MaxLength(1000) dailyUseDetails!: string;
  @IsString() @MaxLength(1000) deliveryDetails!: string;
  @IsBoolean() enabled!: boolean;
}

class DailyObjectsContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(80) brandName!: string;
  @IsString() @MaxLength(80) brandSubtitle!: string;
  @IsString() @MaxLength(120) bagLabel!: string;
  @IsString() @MaxLength(40) bagCount!: string;
  @IsString() @MaxLength(80) eyebrow!: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MinLength(1) @MaxLength(500) intro!: string;
  @IsString() @MaxLength(300) previewNote!: string;
  @IsString() @MaxLength(120) supportLabel!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DailyObjectProductDto) products!: DailyObjectProductDto[];
}

class MinePageContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(6000) title!: string;
  @IsString() @MinLength(1) @MaxLength(6000) intro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) observationHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) emptyTitle!: string;
  @IsString() @MinLength(1) @MaxLength(6000) emptyIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) startButton!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionCount!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionEmptyAction!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceCount!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceEmptyTitle!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) privacyHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) privacyAction!: string;
}

const minePageRichTextFields = [
  ['title', 100], ['intro', 240], ['observationHeading', 60], ['emptyTitle', 100], ['emptyIntro', 240], ['startButton', 60],
  ['discussionHeading', 60], ['discussionCount', 60], ['discussionEmptyAction', 100], ['discussionIntro', 240],
  ['practiceHeading', 60], ['practiceCount', 60], ['practiceEmptyTitle', 100], ['practiceIntro', 240],
  ['privacyHeading', 60], ['privacyAction', 60],
] as const;

function safeRichTextColor(attributes: string) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const fontColor = /\bcolor\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const candidate = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim() ?? fontColor.trim();
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(candidate);
  if (shortHex) return `#${[...shortHex[1]].map((character) => character + character).join('').toLowerCase()}`;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(candidate);
  if (!rgb) return '';
  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel > 255)) return '';
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function safeRichTextFontSize(attributes: string) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const styledSize = /(?:^|;)\s*font-size\s*:\s*(\d{1,3})px\s*(?:;|$)/i.exec(style)?.[1];
  if (styledSize) {
    const size = Number(styledSize);
    if (Number.isInteger(size) && size >= 10 && size <= 48) return `${size}px`;
  }
  const legacySize = /\bsize\s*=\s*(["']?)([1-7])\1/i.exec(attributes)?.[2];
  const legacyPixels: Record<string, number> = { '1': 12, '2': 14, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
  return legacySize ? `${legacyPixels[legacySize]}px` : '';
}

function decodeMineTextEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_entity, decimal: string) => {
      const codePoint = Number(decimal);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_entity, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    });
}

function sanitizeMinePageRichText(value: unknown, maximumCharacters: number, label: string) {
  if (typeof value !== 'string' || value.length > 6000) {
    throw new BadRequestException(`${label}内容无效或过长`);
  }
  const tags: string[] = [];
  const tokens = value.trim().match(/<\/?[a-z][^>]*>|[^<]+|</gi) ?? [];
  let html = '';
  let skippedTag = '';
  const safeTag = (tag: string) => tag === 'div' ? 'p' : tag === 'font' ? 'span' : tag;

  for (const token of tokens) {
    if (token[0] !== '<') {
      if (!skippedTag) html += token;
      continue;
    }
    const closing = /^<\/\s*([a-z][a-z0-9]*)\s*>$/i.exec(token);
    if (skippedTag) {
      if (closing?.[1].toLowerCase() === skippedTag) skippedTag = '';
      continue;
    }
    const opening = /^<\s*([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(token);
    if (opening) {
      const originalTag = opening[1].toLowerCase();
      if (['script', 'style', 'iframe', 'object', 'svg', 'math'].includes(originalTag)) {
        skippedTag = originalTag;
        continue;
      }
      if (!['p', 'div', 'br', 'span', 'font', 'strong', 'b', 'em', 'i', 'u'].includes(originalTag)) continue;
      const tag = safeTag(originalTag);
      if (tag === 'br') {
        html += '<br/>';
        continue;
      }
      if (tag === 'p' && tags.includes(tag)) {
        while (tags.length) {
          const previous = tags.pop()!;
          html += `</${previous}>`;
          if (previous === tag) break;
        }
      }
      if (tag === 'span') {
        const color = safeRichTextColor(opening[2]);
        const fontSize = safeRichTextFontSize(opening[2]);
        const styles = [fontSize && `font-size:${fontSize}`, color && `color:${color}`].filter(Boolean);
        html += styles.length ? `<span style="${styles.join(';')}">` : '<span>';
      } else {
        html += `<${tag}>`;
      }
      tags.push(tag);
      continue;
    }
    if (closing) {
      const tag = safeTag(closing[1].toLowerCase());
      const index = tags.lastIndexOf(tag);
      if (index < 0) continue;
      while (tags.length > index) html += `</${tags.pop()!}>`;
      continue;
    }
    html += '&lt;';
  }
  while (tags.length) html += `</${tags.pop()!}>`;

  const plainText = decodeMineTextEntities(html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\u200b/g, ''));
  const characterCount = Array.from(plainText.trim()).length;
  if (characterCount < 1 || characterCount > maximumCharacters || html.length > 6000) {
    throw new BadRequestException(`${label}文字需为 1 至 ${maximumCharacters} 个字符`);
  }
  return html;
}

function sanitizeMinePageContentFields<T extends Record<string, unknown>>(fields: T): T {
  const sanitized = { ...fields };
  const mutable = sanitized as Record<string, unknown>;
  for (const [key, maximumCharacters] of minePageRichTextFields) {
    if (key in mutable) mutable[key] = sanitizeMinePageRichText(mutable[key], maximumCharacters, key);
  }
  return sanitized;
}

const defaultObservationCopy = {
  metaLeft: { richText: '此刻归安', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'PRIVATE PRACTICE', fontSize: 12, color: '#663124' },
  introTitle: { richText: '先把正在发生的事，<br/>放在眼前。', fontSize: 28, color: '#663124' },
  introDescription: { richText: '辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。', fontSize: 14, color: '#40362f' },
  realityContext: { richText: '从经验出发', fontSize: 12, color: '#8b6b58' },
  realityTitle: { richText: '从现实处境开始', fontSize: 22, color: '#663124' },
  realityDescription: { richText: '沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。', fontSize: 14, color: '#40362f' },
  realityAction: { richText: '开始观察', fontSize: 14, color: '#663124' },
  seasonContext: { richText: '换一个观察角度', fontSize: 12, color: '#8b6b58' },
  seasonTitle: { richText: '从四时气韵开始', fontSize: 22, color: '#663124' },
  seasonDescription: { richText: '从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。', fontSize: 14, color: '#40362f' },
  seasonGuide: { richText: '先了解四时气韵是什么', fontSize: 13, color: '#663124' },
  seasonAction: { richText: '了解方法并开始', fontSize: 14, color: '#663124' },
  privacyLabel: { richText: '仅自己可见', fontSize: 13, color: '#663124' },
  privacyCopy: { richText: '所有观察默认私密。你可以修改、删除或随时停止。', fontSize: 12, color: '#76695f' },
};

function sanitizeObservationCopy(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultObservationCopy).map(([key, fallback]) => {
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      ? source[key] as Record<string, unknown>
      : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 240, `此刻观察${key}`)
      .replace(/<p\b[^>]*>/gi, '')
      .replace(/<\/p\s*>/gi, '<br/>')
      .replace(/<\/?(?:span|strong|b|em|i|u)\b[^>]*>/gi, '');
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
      ? Number(item.fontSize)
      : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  }));
}

const defaultSharedPracticeCopy = {
  topbarTitle: { richText: '共同实践', fontSize: 16, color: '#5c493c' },
  metaLeft: { richText: '共同实践', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'WITH OTHERS', fontSize: 12, color: '#663124' },
  heroTitle: { richText: '一起谈谈，<br/>也在生活中相见。', fontSize: 28, color: '#5c493c' },
  heroIntro: { richText: '线上围绕本期问题，听见不同的经历；线下活动开启后，再在这里相见。', fontSize: 16, color: '#5c493c' },
  onlineContext: { richText: '线上 · 本期讨论', fontSize: 11, color: '#8b6b58' },
  onlineNumber: { richText: '01', fontSize: 11, color: '#8b6b58' },
  onlineCopy: { richText: '讲一个真实处境，也听听其他人如何理解自己的经验。', fontSize: 15, color: '#5c493c' },
  onlineAction: { richText: '一起谈谈', fontSize: 14, color: '#663124' },
  onlineIssueLabel: { richText: 'ISSUE 02', fontSize: 11, color: '#8b6b58' },
  onlineIssueTheme: { richText: '手指一根一根松开', fontSize: 11, color: '#8b6b58' },
  onlineQuestion: { richText: '事情过去以后，<br/>我们还在握紧什么？', fontSize: 20, color: '#5c493c' },
  offlineNumber: { richText: '02', fontSize: 11, color: '#8b6b58' },
  offlineContext: { richText: '线下 · 未来相见', fontSize: 11, color: '#8b6b58' },
  offlineTitle: { richText: '目前没有正在招募的线下活动。', fontSize: 19, color: '#5c493c' },
  offlineCopy: { richText: '时间、地点和带领者确认后，会在这里完整说明。', fontSize: 15, color: '#5c493c' },
  noticeLabel: { richText: '线下活动开放时会说明', fontSize: 11, color: '#8b6b58' },
  noticeCode: { richText: 'NOTICE', fontSize: 11, color: '#663124' },
  rule1Number: { richText: '01', fontSize: 11, color: '#8b6b58' }, rule1Title: { richText: '为什么相见', fontSize: 15, color: '#5c493c' }, rule1Copy: { richText: '这次实践回应什么真实需要', fontSize: 12, color: '#5c493c' },
  rule2Number: { richText: '02', fontSize: 11, color: '#8b6b58' }, rule2Title: { richText: '如何发生', fontSize: 15, color: '#5c493c' }, rule2Copy: { richText: '时间、地点与参与方式', fontSize: 12, color: '#5c493c' },
  rule3Number: { richText: '03', fontSize: 11, color: '#8b6b58' }, rule3Title: { richText: '谁来带领', fontSize: 15, color: '#5c493c' }, rule3Copy: { richText: '清楚说明经验与责任边界', fontSize: 12, color: '#5c493c' },
  rule4Number: { richText: '04', fontSize: 11, color: '#8b6b58' }, rule4Title: { richText: '如何退出', fontSize: 15, color: '#5c493c' }, rule4Copy: { richText: '任何人都可以保留或离开', fontSize: 12, color: '#5c493c' },
  nextAction: { richText: '留意下一次线下相见', fontSize: 15, color: '#5c493c' },
};

function sanitizeSharedPracticeCopy(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultSharedPracticeCopy).map(([key, fallback]) => {
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] as Record<string, unknown> : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 240, `共同实践${key}`);
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48 ? Number(item.fontSize) : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  }));
}


/** 单个富文本字段的取值类型。 */
type CopyItem = { richText: string; fontSize: number; color: string };

/**
 * 列表化字段：
 *   - paragraphs：正文段落，数量不限（原 paragraph1..paragraph3）
 *   - rules：线下说明条目，数量不限（原 rule1Number/Title/Copy .. rule4）
 * 旧数据在读取时自动转换为列表，无需回填。
 */
const SHARED_PARAGRAPH_LIMIT = 12;
const SHARED_RULE_LIMIT = 12;

function sanitizeCopyItem(raw: unknown, fallback: CopyItem, label: string): CopyItem {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 240, label);
  const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48 ? Number(item.fontSize) : fallback.fontSize;
  const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
  return { richText, fontSize, color };
}

/** 把旧扁平结构里的段落 / 规则提取为列表；已是列表则直接沿用。 */
function normalizeSharedPracticeCopy(raw: unknown): Record<string, unknown> {
  const base = sanitizeSharedPracticeCopy(raw);
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

  // 段落：优先读取列表，其次由 onlineCopy 单段转换
  const paragraphFallback: CopyItem = defaultSharedPracticeCopy.onlineCopy;
  const rawParagraphs = Array.isArray(source.onlineParagraphs) ? source.onlineParagraphs : null;
  const onlineParagraphs = rawParagraphs
    ? rawParagraphs.slice(0, SHARED_PARAGRAPH_LIMIT).map((item, index) => sanitizeCopyItem(item, paragraphFallback, `共同实践段落${index + 1}`))
    : [sanitizeCopyItem(source.onlineCopy, paragraphFallback, '共同实践讨论说明')];

  // 规则：优先读取列表，其次由 rule1..4 转换
  const ruleFallback: CopyItem = { richText: '', fontSize: 12, color: '#5c493c' };
  const rawRules = Array.isArray(source.rules) ? source.rules : null;
  const legacyRules = [1, 2, 3, 4].map((index) => ({
    number: sanitizeCopyItem(source[`rule${index}Number`], defaultSharedPracticeCopy[`rule${index}Number` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}序号`),
    title: sanitizeCopyItem(source[`rule${index}Title`], defaultSharedPracticeCopy[`rule${index}Title` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}标题`),
    copy: sanitizeCopyItem(source[`rule${index}Copy`], defaultSharedPracticeCopy[`rule${index}Copy` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}说明`),
  }));
  const rules = rawRules
    ? rawRules.slice(0, SHARED_RULE_LIMIT).map((item, index) => {
      const rule = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        number: sanitizeCopyItem(rule.number, legacyRules[index]?.number ?? { richText: String(index + 1).padStart(2, '0'), fontSize: 11, color: '#8b6b58' }, `共同实践规则${index + 1}序号`),
        title: sanitizeCopyItem(rule.title, ruleFallback, `共同实践规则${index + 1}标题`),
        copy: sanitizeCopyItem(rule.copy, ruleFallback, `共同实践规则${index + 1}说明`),
      };
    })
    : legacyRules;

  return { ...base, onlineParagraphs, rules };
}

const defaultPrivacyPageCopy = {
  topbarTitle: { richText: '通知与隐私', fontSize: 16, color: '#5c493c' },
  metaLeft: { richText: '我的', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'PRIVACY &amp; CHOICES', fontSize: 12, color: '#663124' },
  heroTitle: { richText: '方法应当由你使用，<br/>而不是反过来定义你。', fontSize: 28, color: '#5c493c' },
  heroIntro: { richText: '隐私与方法偏好始终由你决定。', fontSize: 16, color: '#5c493c' },
  privacyNumber: { richText: '01', fontSize: 11, color: '#8b6b58' },
  privacyLabel: { richText: '隐私', fontSize: 11, color: '#8b6b58' },
  privacyTitle: { richText: '观察记录默认私密', fontSize: 15, color: '#5c493c' },
  privacyCopy: { richText: '只保存在这台设备上，不自动公开或分享', fontSize: 12, color: '#5c493c' },
  privacyStatus: { richText: '已开启', fontSize: 12, color: '#663124' },
  methodNumber: { richText: '02', fontSize: 11, color: '#8b6b58' },
  methodLabel: { richText: '方法选择', fontSize: 11, color: '#8b6b58' },
  methodTitle: { richText: '暂不使用四时气韵', fontSize: 15, color: '#5c493c' },
  methodCopy: { richText: '你可以随时重新开启这一种观察方式', fontSize: 12, color: '#5c493c' },
  methodAction: { richText: '使用四时气韵', fontSize: 12, color: '#8b6b58' },
  reminderNumber: { richText: '03', fontSize: 11, color: '#8b6b58' },
  reminderLabel: { richText: '提醒与关于', fontSize: 11, color: '#8b6b58' },
  reminderTitle: { richText: '活动提醒', fontSize: 15, color: '#5c493c' },
  reminderCopy: { richText: '共同实践开放时再向你询问', fontSize: 12, color: '#5c493c' },
  reminderAction: { richText: '→', fontSize: 16, color: '#663124' },
  aboutTitle: { richText: '关于 MYRIAD SHE', fontSize: 15, color: '#5c493c' },
  aboutCopy: { richText: '品牌、内容来源与联系方式', fontSize: 12, color: '#5c493c' },
  aboutAction: { richText: '→', fontSize: 16, color: '#663124' },
  localLabel: { richText: '本地数据', fontSize: 11, color: '#8b6b58' },
  localTitle: { richText: '清除只影响这台设备，且无法恢复。', fontSize: 15, color: '#5c493c' },
    localCopy: { richText: '清除本机登录状态和临时数据；云端观察记录及账户数据将保留。', fontSize: 12, color: '#5c493c' },
    localAction: { richText: '清除本地登录状态', fontSize: 15, color: '#663124' },
    localConfirm: { richText: '确定清除这台设备上的登录状态和临时数据吗？云端记录不会删除。', fontSize: 12, color: '#5c493c' },
  footerCopy: { richText: '停用四时气韵不会自动删除历史记录。是否保留，由你决定。', fontSize: 12, color: '#5c493c' },
  policyTitle: { richText: '隐私政策', fontSize: 15, color: '#5c493c' },
  policyCopy: { richText: '了解我们如何处理信息', fontSize: 12, color: '#5c493c' },
};

function sanitizePrivacyPageCopy(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultPrivacyPageCopy).map(([key, fallback]) => {
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      ? source[key] as Record<string, unknown>
      : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, key === 'heroTitle' ? 160 : 320, `通知与隐私${key}`);
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
      ? Number(item.fontSize)
      : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  }));
}

const lifeCardSuits = ['spade', 'heart', 'club', 'diamond'] as const;
const lifeCardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const lifeCardTextLimits = { theme: 40, title: 60, summary: 600, prompt: 300, note: 400, sourceNote: 2000 };

interface LifeCardRow {
  month: number;
  day: number;
  suit: string;
  rank: string;
  theme: string;
  title: string;
  summary: string;
  prompt: string;
  note: string;
  sourceNote: string;
}

function toCsvCell(value: string) {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 解析 CSV（支持引号包裹、字段内换行与 "" 转义）。 */
function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (char === '\r') continue;
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

@Controller('content')
export class ContentController {
  private readonly homeCacheKey = 'myriad-she:content:home:v3';

  constructor(private readonly database: DatabaseService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly config: ConfigService, private readonly redis: RedisService, private readonly jwt: JwtService) {}

  private publicContentCacheTtlSeconds() {
    const configured = Number(this.config.get('CONTENT_PUBLIC_CACHE_TTL_SECONDS', 60));
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 600) : 60;
  }

  private boundedText(value: unknown, maximum: number, minimum = 0): value is string {
    return typeof value === 'string' && value.length >= minimum && value.length <= maximum;
  }

  private validateIssueDraft(value: unknown): IssueDraftContent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('期刊栏目内容格式无效');
    const sections = (value as Record<string, unknown>).sections;
    if (!Array.isArray(sections) || sections.length < 1 || sections.length > 40) throw new BadRequestException('期刊栏目数量须为 1–40 个');
    const ids = new Set<string>();
    const allowedFields: Record<IssueModuleType, string[]> = {
      issueMeta: ['eyebrow', 'month'], coverStory: ['imageObjectKey', 'altText', 'captionLeft', 'captionRight', 'eyebrow', 'title', 'titleFontSize', 'titleColor', 'body', 'bodyFontSize', 'bodyColor', 'byline'], cover: ['imageObjectKey', 'altText', 'captionLeft', 'captionRight'],
      opener: ['eyebrow', 'title', 'body'], story: ['eyebrow', 'title', 'body', 'imageObjectKey', 'altText', 'captionLeft', 'captionRight', 'detailCaptionLeft', 'detailCaptionRight', 'detailSource', 'detailParagraph1', 'detailParagraph2', 'detailQuote', 'officialArticleUrl'], storyAction: ['title', 'body', 'targetId'], image: ['imageObjectKey', 'altText', 'caption'],
      quote: ['text', 'attribution'], audio: ['title', 'duration', 'audioObjectKey', 'transcript', 'quote', 'subtitle', 'tracks'], question: ['eyebrow', 'title', 'body'],
      observationAction: ['title', 'body'], sharedPracticeAction: ['title', 'body'],
      contents: ['title', 'entry1Label', 'entry1Summary', 'entry2Label', 'entry2Summary', 'entry3Label', 'entry3Summary', 'entry4Label', 'entry4Summary'],
      archive: ['title', 'entryLabel', 'entryTitle'], brandFooter: ['title', 'body'],
    };
    const normalized = sections.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException(`第 ${index + 1} 个栏目格式无效`);
      const item = raw as Record<string, unknown>;
      const id = item.id;
      const type = item.type;
      const order = item.order;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || ids.has(id)) throw new BadRequestException('栏目 ID 无效或重复');
      if (typeof type !== 'string' || !issueModuleTypes.includes(type as IssueModuleType)) throw new BadRequestException('栏目类型不受支持');
      if (!Number.isSafeInteger(order) || Number(order) < 0 || Number(order) >= sections.length) throw new BadRequestException('栏目顺序无效');
      if (typeof item.enabled !== 'boolean') throw new BadRequestException('栏目启用状态无效');
      const allowed = new Set(['id', 'type', 'order', 'enabled', ...allowedFields[type as IssueModuleType]]);
      if (Object.keys(item).some((key) => !allowed.has(key))) throw new BadRequestException('栏目包含未登记字段');
      let normalizedTracks: IssueAudioTrack[] | undefined;
      for (const key of allowedFields[type as IssueModuleType]) {
        const field = item[key];
        if (key === 'tracks') {
          if (field === undefined) continue;
          if (type !== 'audio' || !Array.isArray(field) || field.length > 3) throw new BadRequestException('微声音最多添加 3 段');
          const trackIds = new Set<string>();
          normalizedTracks = field.map((rawTrack) => {
            if (!rawTrack || typeof rawTrack !== 'object' || Array.isArray(rawTrack)) throw new BadRequestException('微声音条目格式无效');
            const track = rawTrack as Record<string, unknown>;
            const trackFields = ['id', 'title', 'duration', 'audioObjectKey', 'quote', 'subtitle', 'transcript'];
            if (Object.keys(track).some((trackField) => !trackFields.includes(trackField))) throw new BadRequestException('微声音条目包含未登记字段');
            if (typeof track.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(track.id) || trackIds.has(track.id)) throw new BadRequestException('微声音条目编号无效或重复');
            trackIds.add(track.id);
            const limits: Record<string, number> = { title: 120, duration: 20, quote: 500, subtitle: 500, transcript: 6000 };
            for (const [trackField, maximum] of Object.entries(limits)) {
              const text = track[trackField] ?? '';
              if (typeof text !== 'string' || text.length > maximum || /<\/?[a-z][^>]*>/i.test(text)) throw new BadRequestException('微声音文案须为长度有效的纯文本');
            }
            const objectKey = track.audioObjectKey ?? '';
            if (objectKey !== '' && (typeof objectKey !== 'string' || !this.isManagedMediaObjectKey(objectKey) || !objectKey.startsWith('content/audio/'))) throw new BadRequestException('栏目媒体路径无效');
            return {
              id: track.id, title: String(track.title ?? ''), duration: String(track.duration ?? ''), audioObjectKey: String(objectKey),
              quote: String(track.quote ?? ''), subtitle: String(track.subtitle ?? ''), transcript: String(track.transcript ?? ''),
            };
          });
        } else if (key.endsWith('FontSize')) {
          if (field !== undefined && (!Number.isSafeInteger(field) || Number(field) < 20 || Number(field) > 120)) throw new BadRequestException('文字字号须为 20–120');
        } else if (key.endsWith('Color')) {
          if (field !== undefined && (typeof field !== 'string' || !/^#[0-9a-f]{6}$/i.test(field))) throw new BadRequestException('文字颜色格式无效');
        } else if (key === 'targetId') {
          if (field !== undefined && (typeof field !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(field))) throw new BadRequestException('栏目跳转目标无效');
        } else if (key === 'officialArticleUrl') {
          if (field !== undefined && field !== '') {
            let validArticleUrl = false;
            if (typeof field === 'string' && field.length <= 2048 && !/[\s<>]/.test(field)) {
              try {
                const articleUrl = new URL(field);
                validArticleUrl = articleUrl.protocol === 'https:' && articleUrl.hostname === 'mp.weixin.qq.com' && /^\/s(?:\/|$)/i.test(articleUrl.pathname);
              } catch {}
            }
            if (!validArticleUrl) throw new BadRequestException('公众号文章链接格式无效');
          }
        } else if (key.endsWith('ObjectKey')) {
          if (field !== undefined && field !== null && field !== '' && (typeof field !== 'string' || !this.isManagedMediaObjectKey(field)
            || (key === 'imageObjectKey' && !field.startsWith('content/image/'))
            || (key === 'audioObjectKey' && !field.startsWith('content/audio/')))) throw new BadRequestException('栏目媒体路径无效');
        } else if (field !== undefined && (typeof field !== 'string' || field.length > (['body', 'transcript', 'detailParagraph1', 'detailParagraph2', 'detailQuote'].includes(key) ? 6000 : 500) || /<\/?[a-z][^>]*>/i.test(field))) {
          throw new BadRequestException('栏目文字须为不含 HTML 的纯文本且长度有效');
        }
      }
      ids.add(id);
      const normalizedItem = { ...item, id, type: type as IssueModuleType, order: Number(order), enabled: item.enabled } as IssueModule;
      if (normalizedTracks) {
        normalizedItem.tracks = normalizedTracks;
        const firstTrack = normalizedTracks[0];
        if (firstTrack) Object.assign(normalizedItem, firstTrack);
      }
      return normalizedItem;
    });
    if (new Set(normalized.map((item) => item.order)).size !== normalized.length) throw new BadRequestException('栏目顺序不能重复');
    const sectionIds = new Set(normalized.map((item) => item.id));
    for (const module of normalized) {
      if (module.type === 'storyAction' && module.targetId !== undefined && !sectionIds.has(String(module.targetId))) {
        throw new BadRequestException('人物入口的跳转目标栏目不存在');
      }
    }
    const discussion = (value as Record<string, unknown>).discussion;
    return { sections: normalized.sort((left, right) => left.order - right.order), discussion: discussion === undefined ? defaultDiscussionContent() : validateDiscussionContent(discussion) };
  }

  private legacyIssueDraft(issue: IssueDto | UpdateIssueDto): IssueDraftContent {
    const source = issue as IssueDto;
    return this.validateIssueDraft({ sections: [
      { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: source.label ?? '本期策展', month: source.month ?? '' },
      { id: 'cover', type: 'cover', order: 1, enabled: true, imageObjectKey: source.coverObjectKey ?? null, altText: source.theme ?? '', captionLeft: source.homeCoverCaptionLeft ?? '人物纪实·时雨', captionRight: source.homeCoverCaptionRight ?? '本期封面' },
      { id: 'opener', type: 'opener', order: 2, enabled: true, eyebrow: '本期主题', title: source.theme ?? '', body: source.homeMetaRichText ?? '' },
      { id: 'audio', type: 'audio', order: 3, enabled: Boolean(source.microVoiceObjectKey), title: source.microVoiceTitle ?? '', duration: source.microVoiceDuration ?? '', audioObjectKey: source.microVoiceObjectKey ?? null, quote: '', subtitle: '', transcript: '' },
      { id: 'question', type: 'question', order: 4, enabled: true, eyebrow: '从她的经验，回到你的此刻', title: source.question ?? '', body: '' },
      { id: 'observation-action', type: 'observationAction', order: 5, enabled: true, title: '留给自己观察', body: '从现实处境开始，记录保持私密' },
      { id: 'story', type: 'story', order: 6, enabled: false, eyebrow: '人物纪实', title: '', body: '', imageObjectKey: '', altText: '', captionLeft: '', captionRight: '' },
      { id: 'story-action', type: 'storyAction', order: 7, enabled: false, title: '进入本期人物', body: '', targetId: 'story' },
      { id: 'contents', type: 'contents', order: 8, enabled: true, title: '本期目录', entry1Label: '人物纪实', entry1Summary: source.theme ?? '', entry2Label: '微声音', entry2Summary: '第一个普通早晨', entry3Label: '此刻观察', entry3Summary: '从本期问题继续', entry4Label: '本期讨论', entry4Summary: '一起听见不同的经历' },
      { id: 'archive', type: 'archive', order: 9, enabled: true, title: '策展档案', entryLabel: 'ISSUE 01 · 往期精彩示意', entryTitle: '留住没有答案的时刻' },
      { id: 'brand-footer', type: 'brandFooter', order: 10, enabled: true, title: '我有我的时节', body: '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' },
    ] });
  }

  private isPublicHomeCache(value: unknown): value is PublicHomeCache {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const root = value as Record<string, unknown>;
    const issue = root.issue;
    const issueRecord = typeof issue === 'object' && issue !== null && !Array.isArray(issue)
      ? issue as Record<string, unknown>
      : null;
    const validIssue = issue === null || (issueRecord !== null
      && this.boundedText(issueRecord.code, 64, 2)
      && this.boundedText(issueRecord.label, 80, 2)
      && this.boundedText(issueRecord.month, 40, 2)
      && this.boundedText(issueRecord.theme, 200, 2)
      && this.boundedText(issueRecord.question, 500, 2)
      && (issueRecord.microVoiceTitle === null || this.boundedText(issueRecord.microVoiceTitle, 120))
      && (issueRecord.microVoiceDuration === null || this.boundedText(issueRecord.microVoiceDuration, 20))
      && this.boundedText(issueRecord.homeMetaRichText, 2000)
      && Number.isSafeInteger(issueRecord.homeMetaFontSize) && Number(issueRecord.homeMetaFontSize) >= 12 && Number(issueRecord.homeMetaFontSize) <= 48
      && typeof issueRecord.homeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(issueRecord.homeMetaColor)
      && this.boundedText(issueRecord.homeCoverCaptionLeft, 80)
      && this.boundedText(issueRecord.homeCoverCaptionRight, 80)
      && (issueRecord.coverObjectKey === null
        || (typeof issueRecord.coverObjectKey === 'string'
          && this.isManagedMediaObjectKey(issueRecord.coverObjectKey)
          && issueRecord.coverObjectKey.startsWith('content/image/')))
      && (issueRecord.microVoiceObjectKey === null
        || (typeof issueRecord.microVoiceObjectKey === 'string'
          && this.isManagedMediaObjectKey(issueRecord.microVoiceObjectKey)
          && issueRecord.microVoiceObjectKey.startsWith('content/audio/'))));
    const validModules = root.modules === undefined || (Array.isArray(root.modules) && root.modules.length <= 40 && root.modules.every((module) => {
      if (!module || typeof module !== 'object' || Array.isArray(module)) return false;
      const record = module as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.type !== 'string' || !Number.isSafeInteger(record.order) || typeof record.enabled !== 'boolean') return false;
      if (record.tracks === undefined) return true;
      return record.type === 'audio' && Array.isArray(record.tracks) && record.tracks.length <= 3 && record.tracks.every((track) => {
        if (!track || typeof track !== 'object' || Array.isArray(track)) return false;
        const audioTrack = track as Record<string, unknown>;
        return typeof audioTrack.id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(audioTrack.id)
          && typeof audioTrack.audioObjectKey === 'string' && this.isManagedMediaObjectKey(audioTrack.audioObjectKey)
          && audioTrack.audioObjectKey.startsWith('content/audio/');
      });
    }));
    return this.boundedText(root.question, 500)
      && Array.isArray(root.sections) && root.sections.length <= 16 && root.sections.every((section) => this.boundedText(section, 80, 1))
      && (root.publishedVersion === undefined || (Number.isSafeInteger(root.publishedVersion) && Number(root.publishedVersion) >= 0))
      && validModules
      && validIssue;
  }

  private async materializePublicHome(cache: PublicHomeCache): Promise<PublicHomeResponse> {
    const [cover, voice] = await Promise.all([
      this.createDownloadUrlIfAvailable(cache.issue?.coverObjectKey ?? undefined),
      this.createDownloadUrlIfAvailable(cache.issue?.microVoiceObjectKey ?? undefined),
    ]);
    const modules = await Promise.all((cache.modules ?? []).filter((item) => item.enabled).map(async (module) => {
      const publicModule = { ...module };
      const imageKey = typeof module.imageObjectKey === 'string' ? module.imageObjectKey : undefined;
      const audioKey = typeof module.audioObjectKey === 'string' ? module.audioObjectKey : undefined;
      delete publicModule.imageObjectKey;
      delete publicModule.audioObjectKey;
      if (imageKey) publicModule.imageUrl = (await this.createDownloadUrlIfAvailable(imageKey))?.url ?? '';
      if (audioKey) publicModule.audioUrl = (await this.createDownloadUrlIfAvailable(audioKey))?.url ?? '';
      if (Array.isArray(module.tracks)) {
        publicModule.tracks = await Promise.all((module.tracks as Array<Record<string, unknown>>).map(async (track) => {
          const publicTrack = { ...track };
          const trackKey = typeof track.audioObjectKey === 'string' ? track.audioObjectKey : undefined;
          delete publicTrack.audioObjectKey;
          publicTrack.audioUrl = trackKey ? (await this.createDownloadUrlIfAvailable(trackKey))?.url ?? '' : '';
          return publicTrack;
        }));
      }
      return publicModule;
    }));
    return {
      issue: cache.issue ? {
        code: cache.issue.code,
        label: cache.issue.label,
        month: cache.issue.month,
        theme: cache.issue.theme,
        question: cache.issue.question,
        microVoiceTitle: cache.issue.microVoiceTitle,
        microVoiceDuration: cache.issue.microVoiceDuration,
        homeMetaRichText: cache.issue.homeMetaRichText,
        homeMetaFontSize: cache.issue.homeMetaFontSize,
        homeMetaColor: cache.issue.homeMetaColor,
        homeCoverCaptionLeft: cache.issue.homeCoverCaptionLeft,
        homeCoverCaptionRight: cache.issue.homeCoverCaptionRight,
      } : null,
      question: cache.question,
      coverUrl: cover?.url ?? '',
      microVoice: {
        title: cache.issue?.microVoiceTitle ?? '',
        duration: cache.issue?.microVoiceDuration ?? '',
        url: voice?.url ?? '',
        enabled: Boolean(voice),
      },
      sections: cache.sections,
      publishedVersion: cache.publishedVersion ?? 0,
      modules,
    };
  }

  private invalidateHomeCache() {
    return this.redis.delete(this.homeCacheKey);
  }

  private homeCacheUnavailable() {
    return new ServiceUnavailableException({
      code: 'content_home_cache_unavailable',
      message: '公开内容缓存暂时无法失效，请稍后重试',
    });
  }

  private orphanMediaGraceHours() {
    const configured = Number(this.config.get('CONTENT_MEDIA_ORPHAN_GRACE_HOURS', 24));
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 720) : 24;
  }

  private isUniqueViolation(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
  }

  private uniqueConstraint(error: unknown) {
    return error && typeof error === 'object' && typeof (error as { constraint?: unknown }).constraint === 'string'
      ? (error as { constraint: string }).constraint
      : '';
  }

  private requiredText(value: string, field: string, minimum: number, maximum: number) {
    const normalized = value.trim();
    if (normalized.length < minimum || normalized.length > maximum) {
      throw new BadRequestException(`${field}长度无效`);
    }
    return normalized;
  }

  private optionalText(value: string | null | undefined, field: string, maximum: number) {
    if (value === null || value === undefined) return value;
    const normalized = value.trim();
    if (normalized.length > maximum) throw new BadRequestException(`${field}长度无效`);
    return normalized || null;
  }

  private safeHomeMetaRichText(value: string | undefined) {
    if (value === undefined) return undefined;
    if (value.length > 2000) throw new BadRequestException('首页期刊信息富文本不能超过 2000 个字符');
    const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span']);
    const withoutExecutableContent = value.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    return withoutExecutableContent.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name: string) => {
      const safeName = name.toLowerCase();
      if (!allowedTags.has(safeName)) return '';
      if (/^<\s*\//.test(tag)) return safeName === 'br' ? '' : `</${safeName}>`;
      return safeName === 'br' ? '<br/>' : `<${safeName}>`;
    }).trim();
  }

  private normalizeIssueInput(body: IssueDto | UpdateIssueDto, requireCoreFields: boolean) {
    const normalized = { ...body } as IssueDto & UpdateIssueDto;
    const coreFields = [
      ['code', '期刊编号', 2, 64],
      ['label', '期刊标签', 2, 80],
      ['month', '期刊月份', 2, 40],
      ['theme', '期刊主题', 2, 200],
      ['question', '本期问题', 2, 500],
    ] as const;
    for (const [key, label, minimum, maximum] of coreFields) {
      const value = normalized[key];
      if (value === undefined) {
        if (requireCoreFields) throw new BadRequestException(`${label}不能为空`);
        continue;
      }
      normalized[key] = this.requiredText(value, label, minimum, maximum) as never;
    }
    normalized.microVoiceTitle = this.optionalText(normalized.microVoiceTitle, '微声音标题', 120) as never;
    normalized.microVoiceDuration = this.optionalText(normalized.microVoiceDuration, '微声音时长', 20) as never;
    normalized.coverObjectKey = this.optionalText(normalized.coverObjectKey, '封面媒体路径', 512) as never;
    normalized.microVoiceObjectKey = this.optionalText(normalized.microVoiceObjectKey, '音频媒体路径', 512) as never;
    normalized.homeMetaRichText = this.safeHomeMetaRichText(normalized.homeMetaRichText) as never;
    const coverCaptionDefaults = { homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面' };
    for (const key of ['homeCoverCaptionLeft', 'homeCoverCaptionRight'] as const) {
      const value = normalized[key];
      if (value === undefined) {
        if (requireCoreFields) normalized[key] = coverCaptionDefaults[key] as never;
        continue;
      }
      const caption = value.trim();
      if (caption.length > 80 || /[\r\n]/.test(caption)) throw new BadRequestException('封面说明文字须为 80 字以内的单行文本');
      normalized[key] = caption as never;
    }
    if (normalized.homeMetaFontSize !== undefined && (!Number.isInteger(normalized.homeMetaFontSize) || normalized.homeMetaFontSize < 12 || normalized.homeMetaFontSize > 48)) {
      throw new BadRequestException('首页期刊信息字号须为 12–48px');
    }
    if (normalized.homeMetaColor !== undefined && !/^#[0-9a-f]{6}$/i.test(normalized.homeMetaColor)) {
      throw new BadRequestException('首页期刊信息颜色格式无效');
    }
    normalized.homeMetaColor = normalized.homeMetaColor?.toLowerCase() as never;
    return normalized;
  }

  private contentConflict(error: unknown) {
    if (!this.isUniqueViolation(error)) return error;
    const constraint = this.uniqueConstraint(error);
    if (constraint === 'content_issues_code_key') {
      return new ConflictException({ code: 'content_issue_code_exists', message: '期刊编号已存在，请修改编号后重试' });
    }
    if (constraint === 'content_issues_single_published_idx') {
      return new ConflictException({ code: 'content_issue_publish_conflict', message: '发布状态发生并发变化，请刷新期刊后重试' });
    }
    return new ConflictException({ code: 'content_issue_conflict', message: '期刊保存发生并发冲突，请刷新后重试' });
  }

  private async validateMediaKeys(input: { coverObjectKey?: string; microVoiceObjectKey?: string }) {
    if (input.coverObjectKey && (!this.isManagedMediaObjectKey(input.coverObjectKey) || !input.coverObjectKey.startsWith('content/image/'))) throw new BadRequestException('封面媒体路径无效');
    if (input.microVoiceObjectKey && (!this.isManagedMediaObjectKey(input.microVoiceObjectKey) || !input.microVoiceObjectKey.startsWith('content/audio/'))) throw new BadRequestException('音频媒体路径无效');
    const mediaKeys = [input.coverObjectKey, input.microVoiceObjectKey].filter((key): key is string => Boolean(key));
    const metadata = await Promise.all(mediaKeys.map((key) => this.storage.objectMetadata(key)));
    if (metadata.some((value) => !value?.contentType)) throw new BadRequestException('期刊引用的媒体对象不存在');
    if (metadata.some((value) => typeof value?.contentLength !== 'number' || value.contentLength <= 0)) throw new BadRequestException('无法读取有效的期刊媒体大小');
    const maxBytes = this.storage.maxUploadBytes();
    if (metadata.some((value) => typeof value?.contentLength === 'number' && value.contentLength > maxBytes)) {
      throw new BadRequestException(`媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    const invalidType = mediaKeys.some((key, index) => key.startsWith('content/image/')
      ? !allowedImageTypes.includes(metadata[index]?.contentType || '')
      : !allowedAudioTypes.includes(metadata[index]?.contentType || ''));
    if (invalidType) throw new BadRequestException('期刊媒体类型与对象路径不匹配');
  }

  private async createDownloadUrlIfAvailable(objectKey?: string) {
    if (!objectKey) return null;
    const metadata = await this.storage.objectMetadata(objectKey);
    if (!this.isAllowedMediaObject(objectKey, metadata)) return null;
    return this.storage.createDownloadUrl(objectKey);
  }

  private isAllowedMediaObject(
    objectKey: string,
    metadata: { contentType: string | null; contentLength: number | null } | null,
  ) {
    if (!this.isManagedMediaObjectKey(objectKey)) return false;
    if (!metadata?.contentType || typeof metadata.contentLength !== 'number' || metadata.contentLength <= 0 || metadata.contentLength > this.storage.maxUploadBytes()) return false;
    if (objectKey.startsWith('content/image/')) return allowedImageTypes.includes(metadata.contentType);
    if (objectKey.startsWith('content/audio/')) return allowedAudioTypes.includes(metadata.contentType);
    return false;
  }

  private isManagedMediaObjectKey(objectKey: string) {
    const isImage = objectKey.startsWith('content/image/');
    const isAudio = objectKey.startsWith('content/audio/');
    const segments = objectKey.split('/');
    return objectKey.length <= 512
      && !/[\\\s\u0000-\u001F\u007F?#]/.test(objectKey)
      && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
      && (isImage ? objectKey.length > 'content/image/'.length : isAudio && objectKey.length > 'content/audio/'.length);
  }

  private async archiveOtherPublishedIssues(client: PoolClient, actorId: string, exceptId?: string) {
    const values = exceptId ? [exceptId] : [];
    const result = await client.query<{ id: string }>(
      `update content_issues set status = 'archived', edit_version = edit_version + 1, updated_at = now()
       where status = 'published' ${exceptId ? 'and id <> $1' : ''}
       returning id`, values,
    );
    for (const issue of result.rows) {
      await this.audit.record({
        actorType: 'admin',
        actorId,
        action: 'content.issue.auto_archived',
        resourceType: 'content_issue',
        resourceId: issue.id,
        metadata: { reason: 'single_published_issue' },
      }, client);
    }
  }

  @Post('media/upload-url')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async mediaUploadUrl(@Req() request: Request & { user?: { sub: string } }, @Body() body: MediaUploadDto) {
    const allowed = body.kind === 'image' ? allowedImageTypes : allowedAudioTypes;
    if (!allowed.includes(body.contentType)) throw new BadRequestException('不支持的媒体类型');
    const maxBytes = Math.max(1, Math.floor(Number(this.storage.maxUploadBytes())));
    if (body.fileSize > maxBytes) throw new BadRequestException(`媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    const adminId = request.user?.sub;
    if (!adminId) throw new ForbiddenException('无法确认当前管理员身份');
    const target = await this.storage.createUploadUrl(body.fileName, body.contentType, body.kind, body.fileSize);
    const cleanupToken = await this.jwt.signAsync({ sub: adminId, scope: 'content_media_cleanup', objectKey: target.objectKey }, { expiresIn: 24 * 60 * 60 });
    return { ...target, cleanupToken };
  }

  @Delete('media')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async deleteUnusedMedia(@Req() request: Request & { user?: { sub: string } }, @Body() body: MediaDeleteDto) {
    if (!this.isManagedMediaObjectKey(body.objectKey)) throw new BadRequestException('无效的媒体对象');
    if (body.objectKey.startsWith('content/audio/')) {
      throw new ConflictException({ code: 'audio_media_retained', message: '已上传的音频按保留策略存档，不支持回收' });
    }
    if (body.purpose === 'temporary') {
      let claims: { sub?: string; scope?: string; objectKey?: string };
      try {
        if (!body.cleanupToken) throw new Error('missing_cleanup_token');
        claims = await this.jwt.verifyAsync(body.cleanupToken);
      } catch {
        throw new ForbiddenException({ code: 'media_cleanup_token_invalid', message: '临时媒体清理凭证无效或已过期' });
      }
      if (claims.scope !== 'content_media_cleanup' || claims.sub !== request.user?.sub || claims.objectKey !== body.objectKey) {
        throw new ForbiddenException({ code: 'media_cleanup_token_invalid', message: '临时媒体清理凭证与当前对象或管理员不匹配' });
      }
    }
    return this.database.withSessionAdvisoryLock('myriad-she-content-media', async (client) => {
      if (body.purpose === 'orphan') {
        const metadata = await this.storage.objectMetadata(body.objectKey);
        if (!metadata) throw new NotFoundException('媒体对象不存在');
        const modifiedAt = metadata.lastModified;
        const cutoff = Date.now() - this.orphanMediaGraceHours() * 60 * 60 * 1000;
        if (!(modifiedAt instanceof Date) || Number.isNaN(modifiedAt.getTime()) || modifiedAt.getTime() > cutoff) {
          throw new ConflictException({ code: 'media_protected', message: '媒体对象仍在保护期内或修改时间不可确认' });
        }
      }

      await this.database.withClientTransaction(client, async (transaction) => {
        const references = await transaction.query(
          `select exists (
             select 1 from content_issues
             where cover_object_key = $1 or micro_voice_object_key = $1
           ) or exists (
             select 1 from content_issues issue,
               jsonb_array_elements(coalesce(issue.draft_content->'sections', '[]'::jsonb)) module
             where module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1
                or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1)
           ) or exists (
             select 1 from content_issue_publications publication,
               jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
             where module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1
                or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1)
           ) or exists (
             select 1 from content_daily_objects daily,
               jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
             where product->>'image' = $1
           ) as referenced`, [body.objectKey],
        );
        if (references.rows[0]?.referenced) {
          throw new ConflictException({ code: 'media_referenced', message: '该媒体仍被期刊引用' });
        }
        await this.audit.record({
          actorType: 'admin',
          actorId: request.user?.sub,
          action: 'content.media.deletion_requested',
          resourceType: 'content_media',
          resourceId: body.objectKey,
          metadata: { purpose: body.purpose },
        }, transaction);
      });

      try {
        await this.storage.deleteObject(body.objectKey);
      } catch (error) {
        try {
          await this.database.withClientTransaction(client, (transaction) => this.audit.record({
            actorType: 'admin',
            actorId: request.user?.sub,
            action: 'content.media.deletion_failed',
            resourceType: 'content_media',
            resourceId: body.objectKey,
            metadata: { purpose: body.purpose, stage: 'object_delete' },
          }, transaction));
        } catch {
          // The committed deletion intent remains available if failure auditing is unavailable.
        }
        throw error;
      }

      let auditRecorded = true;
      try {
        await this.database.withClientTransaction(client, (transaction) => this.audit.record({
          actorType: 'admin',
          actorId: request.user?.sub,
          action: 'content.media.deleted',
          resourceType: 'content_media',
          resourceId: body.objectKey,
          metadata: { purpose: body.purpose },
        }, transaction));
      } catch {
        auditRecorded = false;
      }
      return { deleted: true, auditIntentRecorded: true, auditRecorded };
    });
  }

  @Get('media/orphans')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listOrphanMedia(@Query('limit') limitValue?: string, @Query('continuationToken') continuationToken?: string) {
    const { limit } = parsePagination(limitValue, undefined, { defaultLimit: 50, maxLimit: 100, label: '媒体分页' });
    const normalizedContinuationToken = continuationToken?.trim() || undefined;
    if (normalizedContinuationToken && normalizedContinuationToken.length > 2048) throw new BadRequestException('媒体分页标记无效');
    const graceHours = this.orphanMediaGraceHours();
    const page = await this.storage.listObjects('content/', limit, normalizedContinuationToken);
    const cutoff = Date.now() - graceHours * 60 * 60 * 1000;
    const candidates = page.items.filter((item) => item.objectKey.startsWith('content/image/')
      && this.isManagedMediaObjectKey(item.objectKey)
      && item.lastModified && item.lastModified.getTime() <= cutoff);
    const keys = candidates.map((item) => item.objectKey);
    const referenced = keys.length
      ? await this.database.query<{ objectKey: string }>(
        `select listed.object_key as "objectKey"
         from unnest($1::text[]) as listed(object_key)
         where exists (
           select 1 from content_issues
           where cover_object_key = listed.object_key or micro_voice_object_key = listed.object_key
         ) or exists (
           select 1 from content_issues issue,
             jsonb_array_elements(coalesce(issue.draft_content->'sections', '[]'::jsonb)) module
           where module->>'imageObjectKey' = listed.object_key or module->>'audioObjectKey' = listed.object_key
              or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = listed.object_key)
         ) or exists (
           select 1 from content_issue_publications publication,
             jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
           where module->>'imageObjectKey' = listed.object_key or module->>'audioObjectKey' = listed.object_key
              or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = listed.object_key)
         ) or exists (
           select 1 from content_daily_objects daily,
             jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
           where product->>'image' = listed.object_key
         )`, [keys],
      )
      : { rows: [] as Array<{ objectKey: string }> };
    const referencedKeys = new Set(referenced.rows.map((row) => row.objectKey));
    return {
      items: candidates.filter((item) => !referencedKeys.has(item.objectKey)).map((item) => ({
        objectKey: item.objectKey,
        size: item.size,
        lastModified: item.lastModified?.toISOString() ?? null,
      })),
      continuationToken: page.continuationToken,
      hasMore: page.hasMore,
      graceHours,
    };
  }

  @Get('media/audio')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listAudioMedia(@Query('limit') limitValue?: string, @Query('continuationToken') continuationToken?: string) {
    const { limit } = parsePagination(limitValue, undefined, { defaultLimit: 50, maxLimit: 100, label: '音频分页' });
    const normalizedContinuationToken = continuationToken?.trim() || undefined;
    if (normalizedContinuationToken && normalizedContinuationToken.length > 2048) throw new BadRequestException('音频分页标记无效');
    const page = await this.storage.listObjects('content/audio/', limit, normalizedContinuationToken);
    return {
      items: page.items.filter((item) => item.objectKey.startsWith('content/audio/') && this.isManagedMediaObjectKey(item.objectKey)).map((item) => ({
        objectKey: item.objectKey,
        size: item.size,
        lastModified: item.lastModified?.toISOString() ?? null,
      })),
      continuationToken: page.continuationToken,
      hasMore: page.hasMore,
    };
  }

  @Get('home')
  @Header('Cache-Control', 'no-store')
  async home() {
    const cached = await this.redis.getJson<PublicHomeCache>(this.homeCacheKey);
    if (cached && this.isPublicHomeCache(cached)) return this.materializePublicHome(cached);
    // Content writes hold the same lock while committing and invalidating the
    // cache. Recheck inside it so an older miss cannot repopulate Redis after
    // a newer issue has been published.
    return this.database.withSessionAdvisoryLock('myriad-she-content-media', async (client) => {
      const lockedCached = await this.redis.getJson<PublicHomeCache>(this.homeCacheKey);
      if (lockedCached && this.isPublicHomeCache(lockedCached)) return this.materializePublicHome(lockedCached);
      const result = await client.query<{ snapshot: { issue: PublicHomeCache['issue']; sections: IssueModule[] }; version: number }>(
        `select publication.snapshot, publication.version
         from content_issues issue
         join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
         where issue.status = 'published' order by issue.updated_at desc limit 1`,
      );
      const publication = result.rows[0] ?? null;
      const issue = publication?.snapshot.issue ?? null;
      const publicIssue = issue ? {
        code: issue.code,
        label: issue.label,
        month: issue.month,
        theme: issue.theme,
        question: issue.question,
        microVoiceTitle: issue.microVoiceTitle,
        microVoiceDuration: issue.microVoiceDuration,
        homeMetaRichText: issue.homeMetaRichText,
        homeMetaFontSize: issue.homeMetaFontSize,
        homeMetaColor: issue.homeMetaColor,
        homeCoverCaptionLeft: issue.homeCoverCaptionLeft,
        homeCoverCaptionRight: issue.homeCoverCaptionRight,
        coverObjectKey: issue.coverObjectKey,
        microVoiceObjectKey: issue.microVoiceObjectKey,
      } : null;
      const modules = (publication?.snapshot.sections ?? []).slice().sort((left, right) => left.order - right.order);
      const response: PublicHomeCache = {
        issue: publicIssue,
        question: issue?.question ?? '',
        sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
        publishedVersion: publication?.version ?? 0,
        modules,
      };
      await this.redis.setJson(this.homeCacheKey, response, this.publicContentCacheTtlSeconds());
      return this.materializePublicHome(response);
    });
  }

  @Get('archive')
  @Header('Cache-Control', 'no-store')
  async publicArchive() {
    // Read only each issue's immutable latest publication. Draft metadata and
    // draft content must never leak into the public archive.
    const result = await this.database.query(
      `select publication.snapshot->'issue'->>'code' as code,
              publication.snapshot->'issue'->>'label' as label,
              publication.snapshot->'issue'->>'month' as month,
              publication.snapshot->'issue'->>'theme' as theme,
              publication.snapshot->'issue'->>'question' as question,
              issue.status as status,
              publication.version as version,
              publication.published_at as "publishedAt"
       from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status in ('archived', 'published')
       order by publication.published_at asc, issue.id asc`,
    );
    return { issues: result.rows };
  }

  @Get('archive/:code')
  @Header('Cache-Control', 'no-store')
  async publicArchiveIssue(@Param('code') code: string) {
    const normalizedCode = code.trim();
    if (normalizedCode.length < 2 || normalizedCode.length > 64) throw new BadRequestException('期刊编号长度无效');
    const result = await this.database.query<{ snapshot: { issue: PublicHomeCache['issue']; sections: IssueModule[] }; version: number }>(
      `select publication.snapshot, publication.version
       from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status in ('archived', 'published')
         and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)
       order by publication.published_at desc limit 1`, [normalizedCode],
    );
    const publication = result.rows[0];
    if (!publication) throw new NotFoundException('该期内容不存在或尚未发布');
    const issue = publication.snapshot.issue;
    const response: PublicHomeCache = {
      issue,
      question: issue?.question ?? '',
      sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
      publishedVersion: publication.version,
      modules: (publication.snapshot.sections ?? []).slice().sort((left, right) => left.order - right.order),
    };
    return this.materializePublicHome(response);
  }

  @Get('media/view-url')
  @Header('Cache-Control', 'no-store')
  async mediaViewUrl(@Query('objectKey') objectKey?: string) {
    const normalizedObjectKey = objectKey?.trim() || undefined;
    if (!normalizedObjectKey || !this.isManagedMediaObjectKey(normalizedObjectKey)) {
      throw new BadRequestException('无效的媒体对象');
    }
    const result = await this.database.query(
      `select 1 from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version,
         jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
       where issue.status = 'published' and (module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1
         or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1))
       union all
       select 1 from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and (publication.snapshot->'issue'->>'coverObjectKey' = $1 or publication.snapshot->'issue'->>'microVoiceObjectKey' = $1)
       union all
       select 1 from content_daily_objects daily,
         jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
       where product->>'image' = $1 and product->>'enabled' = 'true'
       limit 1`, [normalizedObjectKey],
    );
    if (!result.rows[0]) throw new NotFoundException('媒体不存在或尚未发布');
    if (!this.isAllowedMediaObject(normalizedObjectKey, await this.storage.objectMetadata(normalizedObjectKey))) throw new NotFoundException('媒体对象不存在或类型无效');
    return this.storage.createDownloadUrl(normalizedObjectKey);
  }

  @Get('media/preview-url')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async mediaPreviewUrl(@Query('objectKey') objectKey?: string) {
    const normalizedObjectKey = objectKey?.trim() || undefined;
    if (!normalizedObjectKey || !this.isManagedMediaObjectKey(normalizedObjectKey)) {
      throw new BadRequestException('无效的媒体对象');
    }
    const metadata = await this.storage.objectMetadata(normalizedObjectKey);
    if (!this.isAllowedMediaObject(normalizedObjectKey, metadata)) {
      throw new NotFoundException('媒体对象不存在或类型无效');
    }
    // Unlike the public view URL, this admin-only URL can preview a freshly
    // uploaded but not-yet-published object while an issue is being edited.
    return this.storage.createDownloadUrl(normalizedObjectKey);
  }

  @Get('discussion')
  @Header('Cache-Control', 'no-store')
  async discussion(@Query('issueCode') issueCode?: string) {
    if (issueCode !== undefined && (typeof issueCode !== 'string' || issueCode.length < 2 || issueCode.length > 64)) throw new BadRequestException('期刊编号无效');
    const result = await this.database.query<{ snapshot: { issue: { code: string; label: string }; discussion?: DiscussionContent }; version: number }>(
      `select publication.snapshot, publication.version from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and ($1::text is null or publication.snapshot->'issue'->>'code' = $1)
       order by issue.updated_at desc limit 1`, [issueCode ?? null],
    );
    const publication = result.rows[0];
    if (!publication) throw new NotFoundException('本期讨论尚未发布或期刊已更新，请返回首页重试');
    return {
      issueCode: publication.snapshot.issue.code, issueLabel: publication.snapshot.issue.label,
      publishedVersion: publication.version,
      content: publication.snapshot.discussion === undefined ? defaultDiscussionContent() : validateDiscussionContent(publication.snapshot.discussion),
    };
  }

  @Get('issues')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issues() {
    const result = await this.database.query(`select issue.id, issue.code, issue.label, issue.month, issue.theme, issue.question, issue.status,
      issue.edit_version as "editVersion", issue.micro_voice_title as "microVoiceTitle", issue.micro_voice_duration as "microVoiceDuration",
      issue.cover_object_key as "coverObjectKey", issue.micro_voice_object_key as "microVoiceObjectKey", issue.home_meta_rich_text as "homeMetaRichText",
      issue.home_meta_font_size as "homeMetaFontSize", issue.home_meta_color as "homeMetaColor", issue.home_cover_caption_left as "homeCoverCaptionLeft",
      issue.home_cover_caption_right as "homeCoverCaptionRight", issue.draft_content as "draftContent", issue.published_version as "publishedVersion",
      publication.snapshot->'issue'->>'label' as "publishedLabel", publication.snapshot->'issue'->>'month' as "publishedMonth",
      publication.snapshot->'issue'->>'code' as "publishedCode", publication.snapshot->'issue'->>'theme' as "publishedTheme",
      publication.snapshot->'issue'->>'question' as "publishedQuestion", issue.updated_at as "updatedAt"
      from content_issues issue left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
      order by issue.updated_at desc`);
    return result.rows.map((issue) => ({ ...issue, draftContent: { ...issue.draftContent, discussion: issue.draftContent?.discussion ? validateDiscussionContent(issue.draftContent.discussion) : defaultDiscussionContent() } }));
  }

  @Get('issues/:id/history')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issuePublicationHistory(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.database.query(
      `select publication.id, publication.version, publication.snapshot, publication.published_at as "publishedAt", publication.published_by as "publishedBy"
       from content_issue_publications publication where publication.issue_id = $1 order by publication.version desc limit 100`, [id],
    );
    return result.rows;
  }

  @Get('issues/summary')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issueSummary() {
    const result = await this.database.query<{
      draftCount: string;
      publishedCount: string;
      archivedCount: string;
      publishedCode: string | null;
      publishedUpdatedAt: string | null;
    }>(
      `select
         count(*) filter (where status = 'draft')::text as "draftCount",
         count(*) filter (where status = 'published')::text as "publishedCount",
         count(*) filter (where status = 'archived')::text as "archivedCount",
         (select coalesce(publication.snapshot->'issue'->>'code', issue.code) from content_issues issue
          left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
          where issue.status = 'published' order by issue.updated_at desc, issue.id desc limit 1) as "publishedCode",
         (select updated_at from content_issues where status = 'published' order by updated_at desc, id desc limit 1) as "publishedUpdatedAt"
       from content_issues`,
    );
    const row = result.rows[0];
    return {
      draftCount: parseDatabaseCount(row?.draftCount ?? '0', '草稿期刊总数'),
      publishedCount: parseDatabaseCount(row?.publishedCount ?? '0', '已发布期刊总数'),
      archivedCount: parseDatabaseCount(row?.archivedCount ?? '0', '已归档期刊总数'),
      publishedCode: row?.publishedCode ?? null,
      publishedUpdatedAt: row?.publishedUpdatedAt ?? null,
    };
  }

  @Get('issues/:code')
  @Header('Cache-Control', 'no-store')
  async publishedIssue(@Param('code') code: string) {
    const normalizedCode = code.trim();
    if (normalizedCode.length < 2 || normalizedCode.length > 64) throw new BadRequestException('期刊编号长度无效');
    const result = await this.database.query(
      `select coalesce(publication.snapshot->'issue'->>'code', issue.code) as code,
              coalesce(publication.snapshot->'issue'->>'label', issue.label) as label,
              coalesce(publication.snapshot->'issue'->>'question', issue.question) as question
       from content_issues issue
       left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)`, [normalizedCode],
    );
    if (!result.rows[0]) throw new NotFoundException('本期问题不存在或尚未发布');
    return result.rows[0];
  }

  @Post('issues')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async createIssue(@Req() request: Request & { user?: { sub: string } }, @Body() body: IssueDto) {
    const normalized = this.normalizeIssueInput(body, true);
    const draftContent = this.validateIssueDraft(normalized.draftContent ?? this.legacyIssueDraft(normalized));
    try {
      const issue = await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        await this.validateMediaKeys({
          coverObjectKey: normalized.coverObjectKey ?? undefined,
          microVoiceObjectKey: normalized.microVoiceObjectKey ?? undefined,
        });
        const result = await client.query(
          `insert into content_issues (code, label, month, theme, question, micro_voice_title, micro_voice_duration, cover_object_key, micro_voice_object_key, home_meta_rich_text, home_meta_font_size, home_meta_color, home_cover_caption_left, home_cover_caption_right, status, draft_content)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15::jsonb) returning id, code, label, month, theme, question, status, edit_version as "editVersion", draft_content as "draftContent", cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_meta_rich_text as "homeMetaRichText", home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft", home_cover_caption_right as "homeCoverCaptionRight"`,
          [normalized.code, normalized.label, normalized.month, normalized.theme, normalized.question, normalized.microVoiceTitle ?? null, normalized.microVoiceDuration ?? null, normalized.coverObjectKey ?? null, normalized.microVoiceObjectKey ?? null, normalized.homeMetaRichText ?? '', normalized.homeMetaFontSize ?? 16, normalized.homeMetaColor ?? '#40362f', normalized.homeCoverCaptionLeft, normalized.homeCoverCaptionRight, JSON.stringify(draftContent)],
        );
        const issue = result.rows[0];
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.issue.created', resourceType: 'content_issue', resourceId: issue?.id, metadata: { code: normalized.code, status: 'draft' } }, client);
        if (!(await this.invalidateHomeCache())) {
          throw this.homeCacheUnavailable();
        }
        return issue;
      });
      return issue;
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  @Post('issues/:id/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishIssue(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: { editVersion?: number }) {
    if (!Number.isSafeInteger(body.editVersion) || Number(body.editVersion) < 1) throw new BadRequestException('期刊版本无效，请重新读取草稿');
    try {
      return await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        const selected = await client.query<Record<string, any>>(
          `select id, code, label, month, theme, question, micro_voice_title as "microVoiceTitle", micro_voice_duration as "microVoiceDuration",
                  cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_meta_rich_text as "homeMetaRichText",
                  home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft",
                  home_cover_caption_right as "homeCoverCaptionRight", draft_content as "draftContent", edit_version as "editVersion", published_version as "publishedVersion", status
           from content_issues where id = $1 for update`, [id],
        );
        const issue = selected.rows[0];
        if (!issue) throw new NotFoundException('期刊不存在');
        if (issue.editVersion !== body.editVersion) throw new ConflictException({ code: 'content_issue_changed', message: '草稿已被其他管理员修改，请载入最新版本后核对' });
        const draft = this.validateIssueDraft(issue.draftContent);
        const enabled = draft.sections.filter((item) => item.enabled);
        for (const type of ['issueMeta', 'question', 'observationAction', 'sharedPracticeAction'] as const) {
          if (!enabled.some((item) => item.type === type)) throw new BadRequestException(`发布内容缺少必需栏目：${type}`);
        }
        const question = enabled.find((item) => item.type === 'question');
        const coverStory = enabled.find((item) => item.type === 'coverStory');
        const opener = coverStory ?? enabled.find((item) => item.type === 'opener');
        if (!this.boundedText(question?.title, 500, 2) || !this.boundedText(opener?.title, 200, 2)) throw new BadRequestException('本期主题与问题不能为空');
        if (!coverStory && !enabled.some((item) => item.type === 'cover')) throw new BadRequestException('发布内容缺少必需栏目：cover');
        if (!coverStory && !enabled.some((item) => item.type === 'opener')) throw new BadRequestException('发布内容缺少必需栏目：opener');
        const hasEditorialImage = enabled.some((item) => ['cover', 'coverStory', 'image', 'story'].includes(item.type)
          && typeof item.imageObjectKey === 'string' && item.imageObjectKey.length > 0);
        if (!hasEditorialImage) throw new BadRequestException('发布前至少需要一张封面或人物图片');
        for (const module of enabled) {
          if ((module.type === 'cover' || module.type === 'image') && (typeof module.imageObjectKey !== 'string' || !module.imageObjectKey)) throw new BadRequestException('启用的图片栏目必须上传图片');
          if (module.type === 'story' && module.imageObjectKey && (!module.altText || typeof module.altText !== 'string')) throw new BadRequestException('人物图文栏目上传图片后必须填写替代文本');
      if (module.type === 'audio') {
        const tracks = module.tracks?.length ? module.tracks : [module as IssueModule & Partial<IssueAudioTrack>];
        if (!tracks.length || tracks.some((track) => typeof track.audioObjectKey !== 'string' || !track.audioObjectKey)) throw new BadRequestException('启用的每段微声音都必须上传音频');
      }
        }
        for (const module of draft.sections) {
          if (typeof module.imageObjectKey === 'string' && module.imageObjectKey) await this.validateMediaKeys({ coverObjectKey: module.imageObjectKey });
          const audioKeys = module.type === 'audio' && module.tracks?.length
            ? module.tracks.map((track) => track.audioObjectKey)
            : [module.audioObjectKey];
          for (const key of audioKeys) {
            if (typeof key === 'string' && key) await this.validateMediaKeys({ microVoiceObjectKey: key });
          }
        }
        const coverSection = draft.sections.find((item) => item.type === 'coverStory' || item.type === 'cover');
        const audio = draft.sections.find((item) => item.type === 'audio');
        const snapshot = {
          issue: {
            code: issue.code, label: issue.label, month: issue.month, theme: issue.theme,
            question: String(question.title), microVoiceTitle: audio?.title ?? issue.microVoiceTitle,
            microVoiceDuration: audio?.duration ?? issue.microVoiceDuration,
            homeMetaRichText: issue.homeMetaRichText, homeMetaFontSize: issue.homeMetaFontSize, homeMetaColor: issue.homeMetaColor,
            homeCoverCaptionLeft: coverSection?.captionLeft ?? issue.homeCoverCaptionLeft,
            homeCoverCaptionRight: coverSection?.captionRight ?? issue.homeCoverCaptionRight,
            coverObjectKey: coverSection?.imageObjectKey ?? issue.coverObjectKey,
            microVoiceObjectKey: audio?.audioObjectKey ?? issue.microVoiceObjectKey,
          },
          sections: draft.sections,
          discussion: draft.discussion,
        };
        const version = Number(issue.publishedVersion || 0) + 1;
        await this.archiveOtherPublishedIssues(client, request.user?.sub || 'admin:unknown', id);
        await client.query(`insert into content_issue_publications (issue_id, version, snapshot, published_by) values ($1, $2, $3::jsonb, $4)`, [id, version, JSON.stringify(snapshot), request.user?.sub || null]);
        await client.query(`update content_issues set status = 'published', published_version = $2, edit_version = edit_version + 1, updated_at = now() where id = $1`, [id, version]);
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.issue.published', resourceType: 'content_issue', resourceId: id, metadata: { code: issue.code, version, moduleCount: draft.sections.length } }, client);
        if (!(await this.invalidateHomeCache())) throw this.homeCacheUnavailable();
        return { published: true, version };
      });
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  @Patch('issues/:id')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateIssue(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateIssueDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('期刊版本无效，请刷新列表后重新打开再编辑');
    const normalized = this.normalizeIssueInput(body, false);
    const allowed: Record<string, string> = { code: 'code', label: 'label', month: 'month', theme: 'theme', question: 'question', microVoiceTitle: 'micro_voice_title', microVoiceDuration: 'micro_voice_duration', coverObjectKey: 'cover_object_key', microVoiceObjectKey: 'micro_voice_object_key', homeMetaRichText: 'home_meta_rich_text', homeMetaFontSize: 'home_meta_font_size', homeMetaColor: 'home_meta_color', homeCoverCaptionLeft: 'home_cover_caption_left', homeCoverCaptionRight: 'home_cover_caption_right', draftContent: 'draft_content' };
    const fields = Object.entries(normalized).filter(([key, value]) => allowed[key] && value !== undefined);
    if (!fields.length) return { updated: false };
    const values = fields.map(([key, value]) => key === 'draftContent' ? JSON.stringify(this.validateIssueDraft(value)) : value);
    const assignments = fields.map(([key], index) => `${allowed[key]} = $${index + 1}${key === 'draftContent' ? '::jsonb' : ''}`);
    values.push(id);
    try {
      const issue = await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        const current = await client.query<{ coverObjectKey: string | null; microVoiceObjectKey: string | null; code: string; status: 'draft' | 'published' | 'archived'; editVersion: number }>(
          `select cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", code, status, edit_version as "editVersion"
           from content_issues where id = $1 for update`, [id],
        );
        if (!current.rows[0]) return { updated: false };
        if (current.rows[0].editVersion !== body.editVersion) {
          throw new ConflictException({ code: 'content_issue_changed', message: '期刊版本已变化，请载入云端最新版本并核对合并内容后再保存。' });
        }
        const coverChanged = normalized.coverObjectKey !== undefined && normalized.coverObjectKey !== current.rows[0].coverObjectKey;
        const voiceChanged = normalized.microVoiceObjectKey !== undefined && normalized.microVoiceObjectKey !== current.rows[0].microVoiceObjectKey;
        if (coverChanged || voiceChanged) {
          await this.validateMediaKeys({
            ...(coverChanged ? { coverObjectKey: normalized.coverObjectKey || undefined } : {}),
            ...(voiceChanged ? { microVoiceObjectKey: normalized.microVoiceObjectKey || undefined } : {}),
          });
        }
        const result = await client.query(`update content_issues set ${assignments.join(', ')}, edit_version = edit_version + 1, updated_at = now() where id = $${values.length} returning id, code, label, month, theme, question, status, edit_version as "editVersion", cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_meta_rich_text as "homeMetaRichText", home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft", home_cover_caption_right as "homeCoverCaptionRight"`, values);
        if (result.rows[0]) {
          await this.audit.record({
            actorType: 'admin',
            actorId: request.user?.sub,
            action: 'content.issue.updated',
            resourceType: 'content_issue',
            resourceId: id,
            metadata: {
              code: current.rows[0].code,
              fields: fields.map(([key]) => key),
            },
          }, client);
          if (!(await this.invalidateHomeCache())) {
            throw this.homeCacheUnavailable();
          }
        }
        return result.rows[0] ?? { updated: false };
      });
      if (issue && 'updated' in issue && issue.updated === false) return issue;
      return issue;
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  /**
   * 解析共同实践文案：指定期刊且该期有独立文案时用该期，否则回退到全局默认值。
   * 返回值统一为列表化结构（onlineParagraphs / rules）。
   */
  private async resolveSharedPracticeCopy(client: PoolClient, globalCopy: unknown, issueCode?: string) {
    const code = (issueCode ?? '').trim();
    if (!code || code.length > 64) return normalizeSharedPracticeCopy(globalCopy);
    const issue = await client.query<{ id: string }>('select id from content_issues where code = $1', [code]);
    const issueId = issue.rows[0]?.id;
    if (!issueId) return normalizeSharedPracticeCopy(globalCopy);
    const stored = await client.query<{ copy: unknown }>('select copy from content_issue_practice_copy where issue_id = $1', [issueId]);
    if (!stored.rows[0]) return normalizeSharedPracticeCopy(globalCopy);
    // 以该期文案为准，缺失字段回落到全局值
    return normalizeSharedPracticeCopy({ ...((globalCopy as Record<string, unknown>) ?? {}), ...((stored.rows[0].copy as Record<string, unknown>) ?? {}) });
  }

  private async readPracticeContent(issueCode?: string) {
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageResult = await client.query<{ title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: unknown; sharedPracticeCopy: unknown; editVersion: number }>(`select title, title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor", intro, intro_rich_text as "introRichText", intro_font_size as "introFontSize", intro_color as "introColor", meta_left_rich_text as "metaLeftRichText", meta_left_font_size as "metaLeftFontSize", meta_left_color as "metaLeftColor", meta_right_rich_text as "metaRightRichText", meta_right_font_size as "metaRightFontSize", meta_right_color as "metaRightColor", observation_copy as "observationCopy", shared_practice_copy as "sharedPracticeCopy", edit_version as "editVersion" from content_practice_page where id = 1`);
      const entriesResult = await client.query<{ key: PracticeEntryKey; title: string; description: string; enabled: boolean; contextRichText: string; contextFontSize: number; contextColor: string; titleRichText: string; titleFontSize: number; titleColor: string; descriptionRichText: string; descriptionFontSize: number; descriptionColor: string }>(
        `select key, title, description, enabled,
                context_rich_text as "contextRichText", context_font_size as "contextFontSize", context_color as "contextColor",
                title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor",
                description_rich_text as "descriptionRichText", description_font_size as "descriptionFontSize", description_color as "descriptionColor"
         from content_practice_entries order by sort_order, key`,
      );
      if (!pageResult.rows[0] || !entriesResult.rows.some((entry) => entry.key === 'observation')) {
        throw new NotFoundException('实践页面内容尚未初始化');
      }
      const entries = entriesResult.rows.map((entry) => ({
        ...entry,
        contextRichText: sanitizeMinePageRichText(entry.contextRichText, 240, '实践目录情境文案'),
        titleRichText: sanitizeMinePageRichText(entry.titleRichText, 80, '实践目录名称'),
        descriptionRichText: sanitizeMinePageRichText(entry.descriptionRichText, 240, '实践目录补充说明'),
      }));
      const page = pageResult.rows[0];
      return {
        ...page,
        titleRichText: sanitizeMinePageRichText(page.titleRichText || page.title, 80, '实践页面标题'),
        introRichText: sanitizeMinePageRichText(page.introRichText || page.intro, 240, '实践页面说明'),
        metaLeftRichText: sanitizeMinePageRichText(page.metaLeftRichText, 80, '实践页左侧页眉'),
        metaRightRichText: sanitizeMinePageRichText(page.metaRightRichText, 80, '实践页右侧页眉'),
        observationCopy: sanitizeObservationCopy(page.observationCopy),
        sharedPracticeCopy: await this.resolveSharedPracticeCopy(client, page.sharedPracticeCopy, issueCode),
        entries,
      };
    });
  }

  @Get('practice')
  @Header('Cache-Control', 'no-store')
  practice(@Query('issueCode') issueCode?: string) {
    return this.readPracticeContent(issueCode);
  }

  @Get('store-status')
  @Header('Cache-Control', 'no-store')
  async storeStatus() {
    return { open: await this.isStoreOpen() };
  }

  /**
   * 商城总闸：系统设置里的 store_enabled 与实践入口 daily-goods 必须同时开启。
   * 任一关闭时，日常之物不对外提供商品，避免后台显示“未开放”而前端仍在售。
   */
  private async isStoreOpen() {
    const result = await this.database.query<{ store: unknown; entryEnabled: unknown }>(
      `select (select value from system_settings where key = 'store_enabled') as store,
              (select enabled from content_practice_entries where key = 'daily-goods') as "entryEnabled"`,
    );
    const row = result.rows[0];
    return row?.store === true && row?.entryEnabled === true;
  }

  private async readDailyObjectsContent() {
    const result = await this.database.query<{ content: unknown; editVersion: number }>(
      `select content, edit_version as "editVersion" from content_daily_objects where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('日常之物页面尚未初始化');
    const content = result.rows[0].content && typeof result.rows[0].content === 'object' && !Array.isArray(result.rows[0].content)
      ? result.rows[0].content as Record<string, unknown> : {};
    const products: Array<Record<string, unknown>> = Array.isArray(content.products) ? content.products.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => ({
      ...(item as Record<string, unknown>),
      optionDetails: typeof (item as Record<string, unknown>).optionDetails === 'string' ? (item as Record<string, unknown>).optionDetails : '',
      dailyUseDetails: typeof (item as Record<string, unknown>).dailyUseDetails === 'string' ? (item as Record<string, unknown>).dailyUseDetails : '',
      deliveryDetails: typeof (item as Record<string, unknown>).deliveryDetails === 'string' ? (item as Record<string, unknown>).deliveryDetails : '',
    })) : [];
    return { ...content, editVersion: result.rows[0].editVersion, products };
  }

  @Get('daily-objects')
  @Header('Cache-Control', 'no-store')
  async dailyObjects() {
    const content = await this.readDailyObjectsContent();
    // 未开放时不下发商品（含价格与图片签名），只保留页面文案供落地页使用。
    if (!(await this.isStoreOpen())) return { ...content, products: [] };
    const products = await Promise.all(content.products.map(async (product) => {
      const image = typeof product.image === 'string' ? product.image : '';
      if (!product.enabled || !image.startsWith('content/image/')) return product;
      const metadata = await this.storage.objectMetadata(image);
      if (!this.isAllowedMediaObject(image, metadata)) return { ...product, image: '' };
      const target = await this.storage.createDownloadUrl(image);
      return { ...product, image: target.url };
    }));
    return { ...content, products };
  }

  @Get('life-card')
  @Header('Cache-Control', 'no-store')
  async lifeCard(@Query('month') monthValue?: string, @Query('day') dayValue?: string) {
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards where month = $1 and day = $2`,
      [month, day],
    );
    if (!result.rows[0]) throw new NotFoundException('这一天的生命牌文案尚未设置');
    return result.rows[0];
  }

  @Post('life-card/view')
  @UseGuards(UserAuthGuard)
  @Header('Cache-Control', 'no-store')
  async recordLifeCardView(
    @Req() request: Request & { user?: { sub: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('需要用户身份');
    const month = Number(body.month);
    const day = Number(body.day);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const card = await this.database.query<{ suit: string; rank: string }>(
      `select suit, rank from content_life_cards where month = $1 and day = $2`,
      [month, day],
    );
    if (!card.rows[0]) throw new NotFoundException('这一天的生命牌尚未设置');
    const inserted = await this.database.query<{ id: string; viewedAt: string }>(
      `insert into life_card_views (user_id, month, day, suit, rank)
       values ($1, $2, $3, $4, $5)
       returning id, viewed_at as "viewedAt"`,
      [userId, month, day, card.rows[0].suit, card.rows[0].rank],
    );
    return { id: inserted.rows[0]?.id ?? '', viewedAt: inserted.rows[0]?.viewedAt ?? '' };
  }

  @Get('life-card-views/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listLifeCardViews(
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
    @Query('from') fromValue?: string,
    @Query('to') toValue?: string,
    @Query('user') userValue?: string,
    @Query('suit') suitValue?: string,
    @Query('rank') rankValue?: string,
  ) {
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 30, maxLimit: 100, label: '查看记录分页' });
    const conditions: string[] = [];
    const values: unknown[] = [];
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (fromValue && datePattern.test(fromValue)) {
      values.push(fromValue);
      conditions.push(`(v.viewed_at at time zone 'Asia/Shanghai')::date >= $${values.length}::date`);
    }
    if (toValue && datePattern.test(toValue)) {
      values.push(toValue);
      conditions.push(`(v.viewed_at at time zone 'Asia/Shanghai')::date <= $${values.length}::date`);
    }
    const user = (userValue ?? '').trim().slice(0, 64);
    if (user) {
      values.push(`%${user}%`);
      conditions.push(`(coalesce(u.nickname, '') ilike $${values.length} or v.user_id::text ilike $${values.length})`);
    }
    if (suitValue && lifeCardSuits.includes(suitValue as typeof lifeCardSuits[number])) {
      values.push(suitValue);
      conditions.push(`v.suit = $${values.length}`);
    }
    if (rankValue && lifeCardRanks.includes(rankValue as typeof lifeCardRanks[number])) {
      values.push(rankValue);
      conditions.push(`v.rank = $${values.length}`);
    }
    const filter = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const pageQuery = `select v.id, v.user_id as "userId", u.nickname, v.month, v.day, v.suit, v.rank, v.viewed_at as "viewedAt"
           from life_card_views v
           left join users u on u.id = v.user_id
          ${filter}
          order by v.viewed_at desc
          limit $${values.length + 1} offset $${values.length + 2}`;
    const totalQuery = `select count(*)::text as total
           from life_card_views v
           left join users u on u.id = v.user_id
          ${filter}`;
    const [rows, total] = await Promise.all([
      this.database.query<{ id: string; userId: string; nickname: string | null; month: number; day: number; suit: string; rank: string; viewedAt: string }>(
        pageQuery,
        [...values, limit, offset],
      ),
      this.database.query<{ total: string }>(totalQuery, values),
    ]);
    return { items: rows.rows, total: parseDatabaseCount(total.rows[0]?.total), limit, offset };
  }
  @Get('life-cards/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listLifeCards() {
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards order by month, day`,
    );
    return { items: result.rows, suits: lifeCardSuits, ranks: lifeCardRanks };
  }

  @Get('life-cards/manage/export')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async exportLifeCards(@Res() response: Response) {
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards order by month, day`,
    );
    const header = ['month', 'day', 'suit', 'rank', 'theme', 'title', 'summary', 'prompt', 'note', 'sourceNote'];
    const rows = result.rows.map((row) => [
      String(row.month), String(row.day), row.suit, row.rank, row.theme, row.title, row.summary, row.prompt, row.note, row.sourceNote,
    ]);
    const csv = [header, ...rows].map((cells) => cells.map(toCsvCell).join(',')).join('\r\n');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="life-cards-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${csv}`);
  }

  @Post('life-cards/manage/import')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async importLifeCards(@Body() body: Record<string, unknown>, @Req() request: Request & { user?: { sub: string } }) {
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!csv.trim()) throw new BadRequestException('导入内容为空');
    const table = parseCsv(csv);
    if (!table.length) throw new BadRequestException('导入内容无法解析');
    const header = table[0].map((cell) => cell.trim());
    const index = (name: string) => header.indexOf(name);
    const required = ['month', 'day', 'suit', 'rank', 'title', 'summary', 'prompt'];
    if (required.some((key) => index(key) < 0)) throw new BadRequestException('缺少必要列：month, day, suit, rank, title, summary, prompt');
    const updated: string[] = [];
    const skipped: string[] = [];
    await this.database.withTransaction(async (client) => {
      for (const row of table.slice(1)) {
        if (!row.length || row.every((cell) => !cell.trim())) continue;
        const month = Number(row[index('month')]);
        const day = Number(row[index('day')]);
        const suit = (row[index('suit')] || '').trim();
        const rank = (row[index('rank')] || '').trim();
        const title = (row[index('title')] || '').trim().slice(0, lifeCardTextLimits.title);
        const summary = (row[index('summary')] || '').trim().slice(0, lifeCardTextLimits.summary);
        const prompt = (row[index('prompt')] || '').trim().slice(0, lifeCardTextLimits.prompt);
        const theme = (row[index('theme')] ?? '').trim().slice(0, lifeCardTextLimits.theme);
        const note = (row[index('note')] ?? '').trim().slice(0, lifeCardTextLimits.note);
        const sourceNote = (row[index('sourceNote')] ?? '').trim().slice(0, lifeCardTextLimits.sourceNote);
        const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31
          && lifeCardSuits.includes(suit as typeof lifeCardSuits[number]) && lifeCardRanks.includes(rank as typeof lifeCardRanks[number])
          && title && summary && prompt;
        if (!valid) { skipped.push(`${month}-${day}`); continue; }
        const result = await client.query(
          `update content_life_cards
              set suit = $3, rank = $4, theme = $5, title = $6, summary = $7, prompt = $8, note = $9, source_note = $10, updated_at = now(), updated_by = $11
            where month = $1 and day = $2
            returning month, day`,
          [month, day, suit, rank, theme, title, summary, prompt, note, sourceNote, request.user?.sub ?? null],
        );
        if (result.rows[0]) updated.push(`${month}-${day}`); else skipped.push(`${month}-${day}`);
      }
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.life_cards.imported',
        resourceType: 'content_life_card',
        metadata: { updated: updated.length, skipped: skipped.length },
      }, client);
    });
    return { updated: updated.length, skipped: skipped.length, skippedKeys: skipped.slice(0, 20) };
  }

  @Patch('life-cards/manage/:month/:day')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateLifeCard(
    @Param('month') monthValue: string,
    @Param('day') dayValue: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user?: { sub: string } },
  ) {
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const suit = String(body.suit ?? '');
    if (!lifeCardSuits.includes(suit as typeof lifeCardSuits[number])) throw new BadRequestException('花色无效');
    const rank = String(body.rank ?? '');
    if (!lifeCardRanks.includes(rank as typeof lifeCardRanks[number])) throw new BadRequestException('牌面点数无效');
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, lifeCardTextLimits.theme) : '';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, lifeCardTextLimits.title) : '';
    const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, lifeCardTextLimits.summary) : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, lifeCardTextLimits.prompt) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, lifeCardTextLimits.note) : '';
    const sourceNote = typeof body.sourceNote === 'string' ? body.sourceNote.trim().slice(0, lifeCardTextLimits.sourceNote) : '';
    if (!title || !summary || !prompt) throw new BadRequestException('标题、说明与观察提示不能为空');
    return this.database.withTransaction(async (client) => {
      const updated = await client.query<LifeCardRow>(
        `update content_life_cards
            set suit = $3, rank = $4, theme = $5, title = $6, summary = $7, prompt = $8, note = $9, source_note = $10, updated_at = now(), updated_by = $11
          where month = $1 and day = $2
          returning month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote"`,
        [month, day, suit, rank, theme, title, summary, prompt, note, sourceNote, request.user?.sub ?? null],
      );
      if (!updated.rows[0]) throw new NotFoundException('这一天的生命牌文案尚未初始化');
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.life_card.updated',
        resourceType: 'content_life_card',
        resourceId: `${month}-${day}`,
        metadata: { month, day, suit, rank },
      }, client);
      return updated.rows[0];
    });
  }

  @Get('daily-objects/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async manageDailyObjects() {
    const published = await this.readDailyObjectsContent();
    const draft = await this.database.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects'`);
    return draft.rows[0] ? { ...draft.rows[0].content, editVersion: draft.rows[0].editVersion, draft: true } : { ...published, draft: false };
  }

  @Patch('daily-objects/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateDailyObjects(@Req() request: Request & { user?: { sub: string } }, @Body() body: DailyObjectsContentDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('日常之物版本无效，请重新读取');
    const ids = body.products.map((product) => product.id.trim());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('商品编号不能重复');
    const products = await Promise.all(body.products.map(async (product) => {
      const normalized = { ...product, id: product.id.trim(), name: product.name.trim(), english: product.english.trim(), image: product.image.trim(), price: product.price.trim(), priceLabel: product.priceLabel.trim(), description: product.description.trim(), optionDetails: product.optionDetails.trim(), dailyUseDetails: product.dailyUseDetails.trim(), deliveryDetails: product.deliveryDetails.trim() };
      if (!normalized.name || !normalized.english || !normalized.image || !normalized.description) throw new BadRequestException('商品名称、英文标识、图片路径和详情说明不能为空');
      if (normalized.image.startsWith('content/image/')) {
        if (!this.isManagedMediaObjectKey(normalized.image) || !this.isAllowedMediaObject(normalized.image, await this.storage.objectMetadata(normalized.image))) throw new BadRequestException('商品图片对象不存在或格式无效');
      } else if (!normalized.image.startsWith('/assets/shop/') && !/^https:\/\/[^\s]+$/i.test(normalized.image)) throw new BadRequestException('商品图片请上传图片或使用商店素材路径 / HTTPS 地址');
      return normalized;
    }));
    const content = { brandName: body.brandName.trim(), brandSubtitle: body.brandSubtitle.trim(), bagLabel: body.bagLabel.trim(), bagCount: body.bagCount.trim(), eyebrow: body.eyebrow.trim(), title: body.title.trim(), intro: body.intro.trim(), previewNote: body.previewNote.trim(), supportLabel: body.supportLabel.trim(), products };
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number; content: { products?: Array<{ id?: string }> } }>(`select edit_version as "editVersion", content from content_daily_objects where id = 1 for update`);
      if (!current.rows[0]) throw new NotFoundException('日常之物页面尚未初始化');
      const existingDraft = await client.query<{ content: { products?: Array<{ id?: string }> }; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects' for update`);
      const currentVersion = existingDraft.rows[0]?.editVersion ?? current.rows[0].editVersion;
      if (currentVersion !== body.editVersion) throw new ConflictException({ code: 'daily_objects_content_changed', message: '日常之物草稿已被其他管理员更新，请重新载入后再保存。' });
      const retainedProductIds = new Set(products.map((product) => product.id));
      if ((existingDraft.rows[0]?.content?.products ?? current.rows[0].content?.products ?? []).some((product) => typeof product.id === 'string' && !retainedProductIds.has(product.id))) {
        throw new BadRequestException('商品不能永久删除；请关闭“在商品页显示”进行下架。');
      }
      const nextVersion = currentVersion + 1;
      await client.query(
        `insert into admin_content_drafts (content_key, content, edit_version, updated_by)
         values ('daily-objects', $1::jsonb, $2, $3)
         on conflict (content_key) do update set content = excluded.content, edit_version = excluded.edit_version, updated_by = excluded.updated_by, updated_at = now()`,
        [JSON.stringify(content), nextVersion, request.user?.sub ?? null],
      );
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.daily_objects.draft_saved', resourceType: 'daily_objects_content', resourceId: 'daily-objects', metadata: { productCount: products.length, productIds: products.map((product) => product.id), enabledProducts: products.filter((product) => product.enabled).map((product) => product.id) } }, client);
      return { ...content, editVersion: nextVersion, draft: true };
    });
  }

  @Post('daily-objects/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishDailyObjects(@Req() request: Request & { user?: { sub: string } }) {
    return this.database.withTransaction(async (client) => {
      const draft = await client.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects' for update`);
      if (!draft.rows[0]) throw new BadRequestException('当前没有待发布的日常之物草稿');
      const saved = await client.query(`update content_daily_objects set content = $1::jsonb, edit_version = edit_version + 1, updated_at = now() where id = 1 returning edit_version as "editVersion"`, [JSON.stringify(draft.rows[0].content)]);
      await client.query(`delete from admin_content_drafts where content_key = 'daily-objects'`);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.daily_objects.published', resourceType: 'daily_objects_content', resourceId: 'daily-objects', metadata: { sourceDraftVersion: draft.rows[0].editVersion } }, client);
      return { ...draft.rows[0].content, editVersion: saved.rows[0]?.editVersion, draft: false };
    });
  }

  @Get('practice/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async managePractice() {
    const published = await this.readPracticeContent();
    const draft = await this.database.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'practice'`);
    return draft.rows[0] ? { ...draft.rows[0].content, editVersion: draft.rows[0].editVersion, draft: true } : { ...published, draft: false };
  }

  /** 读取某期的共同实践文案（未单独保存时回退到全局默认值）。 */
  @Get('practice-copy/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async readIssuePracticeCopy(@Query('issueCode') issueCode?: string) {
    const code = (issueCode ?? '').trim();
    if (!code || code.length > 64) throw new BadRequestException('期刊编号无效');
    return this.database.withTransaction(async (client) => {
      const issue = await client.query<{ id: string; label: string; theme: string }>(
        'select id, label, theme from content_issues where code = $1', [code],
      );
      const row = issue.rows[0];
      if (!row) throw new NotFoundException('未找到该期刊');
      const page = await client.query<{ sharedPracticeCopy: unknown }>('select shared_practice_copy as "sharedPracticeCopy" from content_practice_page limit 1');
      const stored = await client.query<{ copy: unknown; updatedAt: string }>(
        'select copy, updated_at as "updatedAt" from content_issue_practice_copy where issue_id = $1', [row.id],
      );
      const globalCopy = (page.rows[0]?.sharedPracticeCopy ?? {}) as Record<string, unknown>;
      const issueCopy = (stored.rows[0]?.copy ?? null) as Record<string, unknown> | null;
      const copy = normalizeSharedPracticeCopy(issueCopy ? { ...globalCopy, ...issueCopy } : globalCopy);
      return {
        issueCode: code,
        issueLabel: row.label,
        issueTheme: row.theme,
        source: issueCopy ? 'issue' : 'global',
        updatedAt: stored.rows[0]?.updatedAt ?? null,
        copy,
      };
    });
  }

  /** 保存某期的共同实践文案（upsert）。 */
  @Put('practice-copy/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async saveIssuePracticeCopy(
    @Req() request: Request & { user?: { sub: string; role?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const code = String(body.issueCode ?? '').trim();
    if (!code || code.length > 64) throw new BadRequestException('期刊编号无效');
    const copy = normalizeSharedPracticeCopy(body.copy);
    return this.database.withTransaction(async (client) => {
      const issue = await client.query<{ id: string }>('select id from content_issues where code = $1', [code]);
      const issueId = issue.rows[0]?.id;
      if (!issueId) throw new NotFoundException('未找到该期刊');
      await client.query(
        `insert into content_issue_practice_copy (issue_id, copy, updated_at, updated_by)
         values ($1, $2::jsonb, now(), $3)
         on conflict (issue_id) do update set copy = excluded.copy, updated_at = now(), updated_by = excluded.updated_by`,
        [issueId, JSON.stringify(copy), request.user?.sub ?? null],
      );
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.issue_practice_copy.saved',
        resourceType: 'content_issue',
        resourceId: code,
        metadata: { issueCode: code },
      }, client);
      return { saved: true, issueCode: code, copy };
    });
  }

  /** 把某期文案复制到另一期（常用于换期时继承上一期结构）。 */
  @Post('practice-copy/manage/copy-from')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async copyIssuePracticeCopy(
    @Req() request: Request & { user?: { sub: string; role?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const fromCode = String(body.fromIssueCode ?? '').trim();
    const toCode = String(body.toIssueCode ?? '').trim();
    if (!fromCode || !toCode) throw new BadRequestException('需要源期刊与目标期刊');
    if (fromCode === toCode) throw new BadRequestException('源期刊与目标期刊不能相同');
    return this.database.withTransaction(async (client) => {
      const issues = await client.query<{ id: string; code: string }>(
        'select id, code from content_issues where code = any($1)', [[fromCode, toCode]],
      );
      const fromId = issues.rows.find((row) => row.code === fromCode)?.id;
      const toId = issues.rows.find((row) => row.code === toCode)?.id;
      if (!fromId || !toId) throw new NotFoundException('未找到该期刊');
      const page = await client.query<{ sharedPracticeCopy: unknown }>('select shared_practice_copy as "sharedPracticeCopy" from content_practice_page limit 1');
      const globalCopy = (page.rows[0]?.sharedPracticeCopy ?? {}) as Record<string, unknown>;
      const source = await client.query<{ copy: unknown }>('select copy from content_issue_practice_copy where issue_id = $1', [fromId]);
      const sourceCopy = (source.rows[0]?.copy ?? null) as Record<string, unknown> | null;
      const copy = normalizeSharedPracticeCopy(sourceCopy ? { ...globalCopy, ...sourceCopy } : globalCopy);
      await client.query(
        `insert into content_issue_practice_copy (issue_id, copy, updated_at, updated_by)
         values ($1, $2::jsonb, now(), $3)
         on conflict (issue_id) do update set copy = excluded.copy, updated_at = now(), updated_by = excluded.updated_by`,
        [toId, JSON.stringify(copy), request.user?.sub ?? null],
      );
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.issue_practice_copy.copied',
        resourceType: 'content_issue',
        resourceId: toCode,
        metadata: { fromIssueCode: fromCode, toIssueCode: toCode },
      }, client);
      return { copied: true, fromIssueCode: fromCode, toIssueCode: toCode, copy };
    });
  }

  @Patch('practice/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updatePracticeContent(@Req() request: Request & { user?: { sub: string; role?: string } }, @Body() body: PracticeContentDto, publishDraft = false) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) {
      throw new BadRequestException('实践页面版本无效，请刷新后台后重试');
    }
    const keys = body.entries.map((entry) => entry.key);
    if (new Set(keys).size !== keys.length || !keys.includes('observation')) {
      throw new BadRequestException('目录标识不能重复，且“此刻观察”目录必须保留');
    }
    const title = body.title.trim();
    const intro = body.intro.trim();
    if (!title || !intro || body.entries.some((entry) => !entry.title.trim() || !entry.description.trim())) {
      throw new BadRequestException('标题、说明和入口文案不能为空');
    }
    const titleRichText = sanitizeMinePageRichText(body.titleRichText ?? title, 80, '实践页面标题');
    const normalizedTitle = decodeMineTextEntities(titleRichText.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '')).trim();
    if (!normalizedTitle || normalizedTitle.length > 80) throw new BadRequestException('实践页面标题需为有效文字');
    const introRichText = sanitizeMinePageRichText(body.introRichText ?? intro, 240, '实践页面说明');
    const normalizedIntro = decodeMineTextEntities(introRichText.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '')).trim();
    if (!normalizedIntro || normalizedIntro.length > 240) throw new BadRequestException('实践页面说明需为有效文字');
    const metaLeftRichText = sanitizeMinePageRichText(body.metaLeftRichText ?? '实践', 80, '实践页左侧页眉');
    const metaRightRichText = sanitizeMinePageRichText(body.metaRightRichText ?? '此刻归安', 80, '实践页右侧页眉');
    const observationCopy = sanitizeObservationCopy(body.observationCopy);
    const sharedPracticeCopy = normalizeSharedPracticeCopy(body.sharedPracticeCopy);
    const entries = body.entries.map((entry) => {
      const contextRichText = sanitizeMinePageRichText(entry.contextRichText ?? '', 240, '实践目录情境文案');
      const titleRichText = sanitizeMinePageRichText(entry.titleRichText ?? entry.title, 80, '实践目录名称');
      const rawDescription = entry.descriptionRichText ?? entry.description;
      const descriptionRichText = sanitizeMinePageRichText(rawDescription, 240, '实践目录补充说明');
      const title = decodeMineTextEntities(titleRichText.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).trim();
      const description = decodeMineTextEntities(descriptionRichText.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).trim();
      if (!title || title.length > 80 || !description || description.length > 240) throw new BadRequestException('实践目录名称与补充说明需为有效文字');
      return {
        ...entry,
        title,
        description,
        contextRichText,
        contextFontSize: entry.contextFontSize ?? 12,
        contextColor: entry.contextColor ?? '#8b6b58',
        titleRichText,
        titleFontSize: entry.titleFontSize ?? 16,
        titleColor: entry.titleColor ?? '#40362f',
        descriptionRichText,
        descriptionFontSize: entry.descriptionFontSize ?? 13,
        descriptionColor: entry.descriptionColor ?? '#40362f',
      };
    });
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(
        `select edit_version as "editVersion" from content_practice_page where id = 1 for update`,
      );
      if (!current.rows[0]) throw new NotFoundException('实践页面内容尚未初始化');
      const currentDraft = request.user?.role
        ? await client.query<{ editVersion: number }>(`select edit_version as "editVersion" from admin_content_drafts where content_key = 'practice' for update`)
        : { rows: [] as Array<{ editVersion: number }> };
      const currentVersion = currentDraft.rows[0]?.editVersion ?? current.rows[0].editVersion;
      if (currentVersion !== body.editVersion) {
        throw new ConflictException({ code: 'practice_content_changed', message: '实践页面内容已被其他管理员更新，请重新载入后再保存。' });
      }
      const existingEntries = await client.query<{ key: string }>(`select key from content_practice_entries`);
      const retainedEntryKeys = new Set(entries.map((entry) => entry.key));
      if (existingEntries.rows.some((entry) => !retainedEntryKeys.has(entry.key))) {
        throw new BadRequestException('实践入口不能永久删除；请关闭入口状态进行下架。');
      }
      if (!publishDraft && request.user?.role) {
        const nextVersion = currentVersion + 1;
        const draftContent = {
          editVersion: nextVersion, title: normalizedTitle, titleRichText, titleFontSize: body.titleFontSize ?? 12, titleColor: body.titleColor ?? '#8b6b58',
          intro: normalizedIntro, introRichText, introFontSize: body.introFontSize ?? 28, introColor: body.introColor ?? '#40362f',
          metaLeftRichText, metaLeftFontSize: body.metaLeftFontSize ?? 12, metaLeftColor: body.metaLeftColor ?? '#8b6b58',
          metaRightRichText, metaRightFontSize: body.metaRightFontSize ?? 12, metaRightColor: body.metaRightColor ?? '#8b6b58',
          observationCopy, sharedPracticeCopy, entries,
        };
        await client.query(
          `insert into admin_content_drafts (content_key, content, edit_version, updated_by)
           values ('practice', $1::jsonb, $2, $3)
           on conflict (content_key) do update set content = excluded.content, edit_version = excluded.edit_version, updated_by = excluded.updated_by, updated_at = now()`,
          [JSON.stringify(draftContent), nextVersion, request.user?.sub ?? null],
        );
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.practice.draft_saved', resourceType: 'practice_content', resourceId: 'practice-page', metadata: { editVersion: nextVersion, entryKeys: entries.map((entry) => entry.key) } }, client);
        return { ...draftContent, draft: true };
      }
      const page = await client.query<{ title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: unknown; sharedPracticeCopy: unknown; editVersion: number }>(
        `update content_practice_page set title = $1, title_rich_text = $2, title_font_size = $3, title_color = $4,
           intro = $5, intro_rich_text = $6, intro_font_size = $7, intro_color = $8,
           meta_left_rich_text = $9, meta_left_font_size = $10, meta_left_color = $11,
           meta_right_rich_text = $12, meta_right_font_size = $13, meta_right_color = $14, observation_copy = $15::jsonb, shared_practice_copy = $16::jsonb,
           edit_version = edit_version + 1, updated_at = now()
         where id = 1 returning title, title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor", intro, intro_rich_text as "introRichText", intro_font_size as "introFontSize", intro_color as "introColor",
           meta_left_rich_text as "metaLeftRichText", meta_left_font_size as "metaLeftFontSize", meta_left_color as "metaLeftColor",
           meta_right_rich_text as "metaRightRichText", meta_right_font_size as "metaRightFontSize", meta_right_color as "metaRightColor", observation_copy as "observationCopy", shared_practice_copy as "sharedPracticeCopy", edit_version as "editVersion"`,
        [normalizedTitle, titleRichText, body.titleFontSize ?? 12, body.titleColor ?? '#8b6b58', normalizedIntro, introRichText, body.introFontSize ?? 28, body.introColor ?? '#40362f', metaLeftRichText, body.metaLeftFontSize ?? 12, body.metaLeftColor ?? '#8b6b58', metaRightRichText, body.metaRightFontSize ?? 12, body.metaRightColor ?? '#8b6b58', JSON.stringify(observationCopy), JSON.stringify(sharedPracticeCopy)],
      );
      if (!page.rows[0]) throw new NotFoundException('实践页面内容尚未初始化');
      await client.query(`delete from content_practice_entries where key <> all($1::text[])`, [keys]);
      // Clear existing order collisions inside the migration's 0..1000 bound before reordering.
      await client.query(`update content_practice_entries set sort_order = 1000`);
      for (const [index, entry] of entries.entries()) {
        await client.query(
          `insert into content_practice_entries
             (key, title, description, enabled, sort_order, context_rich_text, context_font_size, context_color,
              title_rich_text, title_font_size, title_color, description_rich_text, description_font_size, description_color, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
           on conflict (key) do update set title = excluded.title, description = excluded.description,
             enabled = excluded.enabled, sort_order = excluded.sort_order, context_rich_text = excluded.context_rich_text,
             context_font_size = excluded.context_font_size, context_color = excluded.context_color,
             title_rich_text = excluded.title_rich_text, title_font_size = excluded.title_font_size, title_color = excluded.title_color,
             description_rich_text = excluded.description_rich_text, description_font_size = excluded.description_font_size,
             description_color = excluded.description_color, updated_at = now()`,
          [entry.key, entry.title, entry.description, entry.enabled, index + 1, entry.contextRichText, entry.contextFontSize, entry.contextColor, entry.titleRichText, entry.titleFontSize, entry.titleColor, entry.descriptionRichText, entry.descriptionFontSize, entry.descriptionColor],
        );
      }
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.practice.updated',
        resourceType: 'practice_content',
        resourceId: 'practice-page',
        metadata: { fields: ['title', 'titleRichText', 'titleFontSize', 'titleColor', 'intro', 'introRichText', 'introFontSize', 'introColor', 'metaLeftRichText', 'metaLeftFontSize', 'metaLeftColor', 'metaRightRichText', 'metaRightFontSize', 'metaRightColor', 'observationCopy', 'sharedPracticeCopy'], entryKeys: entries.map((entry) => entry.key), entryCount: entries.length, entryFields: ['contextRichText', 'contextFontSize', 'contextColor', 'titleRichText', 'titleFontSize', 'titleColor', 'descriptionRichText', 'descriptionFontSize', 'descriptionColor'], enabledEntries: entries.filter((entry) => entry.enabled).map((entry) => entry.key) },
      }, client);
      await client.query(`delete from admin_content_drafts where content_key = 'practice'`);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.practice.published', resourceType: 'practice_content', resourceId: 'practice-page', metadata: { sourceDraftVersion: body.editVersion } }, client);
      return { ...page.rows[0], observationCopy: sanitizeObservationCopy(page.rows[0].observationCopy), sharedPracticeCopy: normalizeSharedPracticeCopy(page.rows[0].sharedPracticeCopy), entries };
    });
  }

  @Post('practice/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishPracticeDraft(@Req() request: Request & { user?: { sub: string } }) {
    const draft = await this.database.query<{ content: PracticeContentDto }>(`select content from admin_content_drafts where content_key = 'practice'`);
    if (!draft.rows[0]) throw new BadRequestException('当前没有待发布的实践页面草稿');
    return this.updatePracticeContent(request, draft.rows[0].content, true);
  }

  private async readPrivacyPageContent() {
    const result = await this.database.query<{ editVersion: number; copy: unknown }>(
      `select edit_version as "editVersion", copy from content_privacy_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('通知与隐私页面内容尚未初始化');
    return { editVersion: result.rows[0].editVersion, copy: sanitizePrivacyPageCopy(result.rows[0].copy) };
  }

  @Get('privacy')
  @Header('Cache-Control', 'no-store')
  privacyPage() {
    return this.readPrivacyPageContent();
  }

  private sanitizeAboutContent(raw: unknown) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const value = (key: 'brandIntro' | 'contentSources' | 'contactInfo', fallback: string) => {
      const text = source[key];
      return typeof text === 'string' && text.trim().length > 0 && text.length <= 6000 ? text.trim() : fallback;
    };
    return {
      brandIntro: value('brandIntro', 'MYRIAD SHE 是一个陪伴女性回到自身经验的观察与实践空间。'),
      contentSources: value('contentSources', '内容来自团队原创研究、实践设计与经授权引用的资料。'),
      contactInfo: value('contactInfo', '如需联系，请通过应用内客服渠道与我们联系。'),
    };
  }

  private async readAboutContent(draft = false) {
    const result = await this.database.query<{ editVersion: number; content: unknown; publishedVersion: number; publishedAt: Date }>(
      `select edit_version as "editVersion", ${draft ? 'draft' : 'published'} as content, published_version as "publishedVersion", published_at as "publishedAt"
       from content_about_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
    return { editVersion: result.rows[0].editVersion, ...this.sanitizeAboutContent(result.rows[0].content), publishedVersion: result.rows[0].publishedVersion, publishedAt: result.rows[0].publishedAt };
  }

  @Get('about')
  @Header('Cache-Control', 'no-store')
  about() { return this.readAboutContent(); }

  @Get('about/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  manageAbout() { return this.readAboutContent(true); }

  @Patch('about/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async saveAboutDraft(@Req() request: Request & { user?: { sub: string } }, @Body() body: AboutPageDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('关于页面版本无效，请刷新后台后重试');
    const content = this.sanitizeAboutContent(body);
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(`select edit_version as "editVersion" from content_about_page where id = 1 for update`);
      if (!current.rows[0]) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
      if (current.rows[0].editVersion !== body.editVersion) throw new ConflictException({ code: 'about_page_changed', message: '关于内容已被其他管理员更新，请重新载入后再保存。' });
      const saved = await client.query<{ editVersion: number; publishedVersion: number; publishedAt: Date }>(
        `update content_about_page set draft = $1::jsonb, edit_version = edit_version + 1, updated_at = now()
         where id = 1 returning edit_version as "editVersion", published_version as "publishedVersion", published_at as "publishedAt"`, [JSON.stringify(content)],
      );
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.about.draft_saved', resourceType: 'about_content', resourceId: 'about-page', metadata: { fields: Object.keys(content) } }, client);
      return { editVersion: saved.rows[0].editVersion, ...content, publishedVersion: saved.rows[0].publishedVersion, publishedAt: saved.rows[0].publishedAt };
    });
  }

  @Post('about/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishAbout(@Req() request: Request & { user?: { sub: string } }, @Body() body: { editVersion: number }) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('关于内容版本无效，请刷新后台后重试');
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{ editVersion: number; publishedVersion: number; draft: unknown }>(`select edit_version as "editVersion", published_version as "publishedVersion", draft from content_about_page where id = 1 for update`);
      const page = result.rows[0];
      if (!page) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
      if (page.editVersion !== body.editVersion) throw new ConflictException({ code: 'about_page_changed', message: '关于内容草稿已被更新，请重新读取后再发布。' });
      const nextVersion = page.publishedVersion + 1;
      const content = this.sanitizeAboutContent(page.draft);
      await client.query(`update content_about_page set published = draft, published_version = $1, published_at = now(), updated_at = now() where id = 1`, [nextVersion]);
      await client.query(`insert into content_privacy_revisions (content_key, version, content, published_by) values ('about-page', $1, $2::jsonb, $3)`, [nextVersion, JSON.stringify(content), request.user?.sub ?? null]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.about.published', resourceType: 'about_content', resourceId: 'about-page', metadata: { version: nextVersion } }, client);
      return { ...content, publishedVersion: nextVersion, editVersion: page.editVersion };
    });
  }

  @Get('privacy-revisions/:contentKey')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async privacyContentRevisions(@Param('contentKey') contentKey: string) {
    if (!['about-page', 'privacy-policy', 'user-agreement'].includes(contentKey)) throw new BadRequestException('内容类型无效');
    const result = await this.database.query<{ version: number; content: unknown; publishedBy: string | null; publishedAt: Date }>(
      `select r.version, r.content, coalesce(a.display_name, r.published_by) as "publishedBy", r.published_at as "publishedAt"
       from content_privacy_revisions r
       left join admin_accounts a on a.id::text = r.published_by
       where r.content_key = $1 order by r.version desc limit 50`, [contentKey],
    );
    return result.rows;
  }

  private async readMinePageContent() {
    const result = await this.database.query<{ editVersion: number; title: string; intro: string; observationHeading: string; emptyTitle: string; emptyIntro: string; startButton: string; discussionHeading: string; discussionCount: string; discussionEmptyAction: string; discussionIntro: string; practiceHeading: string; practiceCount: string; practiceEmptyTitle: string; practiceIntro: string; privacyHeading: string; privacyAction: string }>(
      `select edit_version as "editVersion", title, intro, observation_heading as "observationHeading", empty_title as "emptyTitle", empty_intro as "emptyIntro", start_button as "startButton",
              discussion_heading as "discussionHeading", discussion_count as "discussionCount", discussion_empty_action as "discussionEmptyAction", discussion_intro as "discussionIntro",
              practice_heading as "practiceHeading", practice_count as "practiceCount", practice_empty_title as "practiceEmptyTitle", practice_intro as "practiceIntro",
              privacy_heading as "privacyHeading", privacy_action as "privacyAction"
       from content_mine_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
    return sanitizeMinePageContentFields(result.rows[0] as unknown as Record<string, unknown>);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  minePage() {
    return this.readMinePageContent();
  }

  @Get('mine/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  manageMinePage() {
    return this.readMinePageContent();
  }

  @Patch('mine/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateMinePageContent(@Req() request: Request & { user?: { sub: string } }, @Body() body: MinePageContentDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) {
      throw new BadRequestException('我的页面版本无效，请刷新后台后重试');
    }
    const content = sanitizeMinePageContentFields({
      title: body.title,
      intro: body.intro,
      observationHeading: body.observationHeading,
      emptyTitle: body.emptyTitle,
      emptyIntro: body.emptyIntro,
      startButton: body.startButton,
      discussionHeading: body.discussionHeading,
      discussionCount: body.discussionCount,
      discussionEmptyAction: body.discussionEmptyAction,
      discussionIntro: body.discussionIntro,
      practiceHeading: body.practiceHeading,
      practiceCount: body.practiceCount,
      practiceEmptyTitle: body.practiceEmptyTitle,
      practiceIntro: body.practiceIntro,
      privacyHeading: body.privacyHeading,
      privacyAction: body.privacyAction,
    });
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(
        `select edit_version as "editVersion" from content_mine_page where id = 1 for update`,
      );
      if (!current.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
      if (current.rows[0].editVersion !== body.editVersion) {
        throw new ConflictException({ code: 'mine_page_content_changed', message: '我的页面文案已被其他管理员更新，请重新载入后再保存。' });
      }
      const updated = await client.query(
        `update content_mine_page
         set title = $1, intro = $2, observation_heading = $3, empty_title = $4, empty_intro = $5, start_button = $6,
             discussion_heading = $7, discussion_count = $8, discussion_empty_action = $9, discussion_intro = $10,
             practice_heading = $11, practice_count = $12, practice_empty_title = $13, practice_intro = $14,
             privacy_heading = $15, privacy_action = $16,
             edit_version = edit_version + 1, updated_at = now()
         where id = 1
         returning edit_version as "editVersion", title, intro, observation_heading as "observationHeading", empty_title as "emptyTitle", empty_intro as "emptyIntro", start_button as "startButton",
                   discussion_heading as "discussionHeading", discussion_count as "discussionCount", discussion_empty_action as "discussionEmptyAction", discussion_intro as "discussionIntro",
                   practice_heading as "practiceHeading", practice_count as "practiceCount", practice_empty_title as "practiceEmptyTitle", practice_intro as "practiceIntro",
                   privacy_heading as "privacyHeading", privacy_action as "privacyAction"`,
        [content.title, content.intro, content.observationHeading, content.emptyTitle, content.emptyIntro, content.startButton,
          content.discussionHeading, content.discussionCount, content.discussionEmptyAction, content.discussionIntro,
          content.practiceHeading, content.practiceCount, content.practiceEmptyTitle, content.practiceIntro, content.privacyHeading, content.privacyAction],
      );
      if (!updated.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.mine_page.updated',
        resourceType: 'mine_page_content',
        resourceId: 'mine-page',
        metadata: { fields: Object.keys(content) },
      }, client);
      return updated.rows[0];
    });
  }
}
