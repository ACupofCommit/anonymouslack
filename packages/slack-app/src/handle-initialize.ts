import to from 'await-to-js'
import { Middleware, SlackActionMiddlewareArgs, SlackShortcutMiddlewareArgs, SlackViewMiddlewareArgs } from "@slack/bolt"
import { IPMDeactivateWarningView, IPMDeletionView, IPMNewReplyView, IPMNewVoiceView, isWebAPIPlatformError } from '@anonymouslack/universal/dist/types'
import { CONST_APP_NAME, getOrCreateGetGroup } from '@anonymouslack/universal/dist/models'
import { agreeAppActivation, forceAppActivate, forceAppDeactivate, getConfigMsgPermalink, getSelectingChannelToInitialView, openViewToPostVoice, postAgreementMesssage, showDeactivateWarning, } from '@anonymouslack/universal/dist/core'
import { parseWOThrow } from '@anonymouslack/universal/dist/utils'
import { WebAPIPlatformError } from '@slack/web-api'

interface ResponseUrl {
  block_id: string
  action_id: string
  channel_id: string
  response_url: string
}

type TParsedPM = IPMNewVoiceView | IPMNewReplyView | IPMDeletionView | IPMDeactivateWarningView

export const handleShortcut: Middleware<SlackShortcutMiddlewareArgs> = async ({body, ack, client}) => {
  await ack();
  const {trigger_id} = body

  const bot = await client.auth.test()
  if (typeof bot.user_id !== 'string') throw new Error('Can not get bot.user_id')

  const viewOpenArg = getSelectingChannelToInitialView(trigger_id, {'hello': 'world'}, bot.user_id)
  await client.views.open(viewOpenArg)
}

export const handleSubmitInit: Middleware<SlackViewMiddlewareArgs> = async ({body, ack, client}) => {
  console.log('handleSubmitInit')
  const {user, team} = body
  const responseUrls = (body as any).response_urls as ResponseUrl[]
  const triggerId = (body as any).trigger_id as string

  if (responseUrls.length < 1) {
    return await ack({
      response_action: 'errors',
      errors: {
        target_channel: `채널을 선택해 주세요.`,
      },
    })
  }

  const {channel_id} = responseUrls[0]
  console.log('channel_id: ' + channel_id)

  const [err0] = await to<any, WebAPIPlatformError>(client.conversations.info({ channel: channel_id }))
  if (err0 && !isWebAPIPlatformError(err0)) throw err0
  if (err0 && err0.data.error !== 'channel_not_found') throw err0
  if (err0) {
    return await ack({
      response_action: 'errors',
      errors: {
        target_channel: `↓ 앱 이름을 클릭하여 채널에 앱을 추가한 후 다시 시도해주세요.`,
      },
    })
  }

  await ack()

  const group = await getOrCreateGetGroup(channel_id, team?.id || '', 'private-channel', team?.enterprise_id)
  const permalink = await getConfigMsgPermalink(client, group)
  if (permalink) {
    return await openViewToPostVoice(client, triggerId, channel_id)
  }

  // 컨피그 메시지가 없거나 삭제된 상태. 컨피그 메시지 작성
  const [err] = await to(postAgreementMesssage(client, group))
  if (
    isWebAPIPlatformError(err)
    && (err.data.error === 'channel_not_found' || err.data.error === 'not_in_channel')
  ) {
    await client.chat.postMessage({
      channel: user.id,
      text: [
        `:point_up_2: *<#${channel_id}>* 채널에서 ${CONST_APP_NAME} 앱을 사용하라면`,
        `바로 위 앱 이름을 클릭하여 'Add this app to a channel' 메뉴를 통해`,
        `*<#${channel_id}>* 채널에 ${CONST_APP_NAME} 앱을 먼저 추가해야합니다.`,
      ].join('\n'),
    })
    return
  }

  if (err) throw err
}

export const handleAgreeAction: Middleware<SlackActionMiddlewareArgs> = async ({
  ack, body, client
}) => {
  const {channel, team, user} = body
  if (!channel || !channel.id) throw new Error('no channel')
  if (!team) throw new Error('no team')

  await ack()
  const group = await getOrCreateGetGroup(channel.id, team.id, channel.name, team.enterprise_id)
  // TODO: say나 respond를 여기에서 사용하자.
  await agreeAppActivation(client, group, user.id, (body as any).response_url)
}

export const handleForceAgreeAction: Middleware<SlackActionMiddlewareArgs> = async ({
  ack, body, client
}) => {
  const {channel, team, user} = body
  if (!channel || !channel.id) throw new Error('no channel')
  if (!team) throw new Error('no team')

  await ack()
  const group = await getOrCreateGetGroup(channel.id, team.id, channel.name, team.enterprise_id)
  // TODO: say나 respond를 여기에서 사용하자.
  await forceAppActivate(client, group, user.id, (body as any).response_url)
}

export const handleShowDeactivateWarning: Middleware<SlackActionMiddlewareArgs> = async ({
  ack, body, client
}) => {
  const {channel, team, user} = body
  if (!channel || !channel.id) throw new Error('no channel')
  if (!team) throw new Error('no team')
  const trigger_id = (body as any).trigger_id
  if (!trigger_id) throw new Error('No trigger_id')

  await ack()
  const group = await getOrCreateGetGroup(channel.id, team.id, channel.name, team.enterprise_id)
  // TODO: say나 respond를 여기에서 사용하자.
  await showDeactivateWarning(client, trigger_id, group)
}

export const handleForceDeactivate: Middleware<SlackViewMiddlewareArgs> = async ({
  ack, body, client, payload
}) => {
  const {team, user} = body
  const pm = parseWOThrow<TParsedPM>(payload.private_metadata)
  if (!pm) throw new Error('No pm')
  if (!team) throw new Error('no team')

  await ack()
  const group = await getOrCreateGetGroup(pm.channelId, team.id, pm.channelName, team.enterprise_id)
  // TODO: say나 respond를 여기에서 사용하자.
  await forceAppDeactivate(client, group, user.id)
}
