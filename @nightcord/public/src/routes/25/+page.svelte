<script lang="ts">
import { Turnstile } from 'svelte-turnstile'
import { N25_PUBLIC_CF_TURNSTILE_SITEKEY, N25_PUBLIC_DEPLOYMENT_ENV } from '$app/env/public'
import { submitPost } from '@/lib/api/submit-post.remote'
import { getPosts, type PostView } from '@/lib/api/get-posts.remote'
import type { TurnstileObject } from 'turnstile-types'
import Fragments from '@/lib/components/fragments.svelte'
import { Fragment } from '@/lib/fragment'
import * as _3 from 'three'
import { Dialog, Popover } from 'bits-ui'

import {
  LoaderCircle,
  Ellipsis,
  ArrowRight,
  Plus,
  Undo2,
  Eye,
  RefreshCcw,
  Heart,
  Quote,
  PenTool,
} from '@lucide/svelte'

import { onMount, type Component } from 'svelte'
import { toast } from 'svelte-sonner'
import { recordView } from '@/lib/api/record-view.remote'
import { clientHeight, clientWidth, cn, randomSelect } from '@/lib/util'
import { blackbodyColor, toCssString } from '@/lib/black-body'

let nickname = $state('')
let message = $state('')
let turnstile: TurnstileObject | null = $state(null)
let widgetId: string | null = $state(null)

let pending = $state(false)
let submittable = $derived.by(() => {
  if (pending) return false

  if (N25_PUBLIC_DEPLOYMENT_ENV === 'production' && (turnstile == null || widgetId == null))
    return false

  if (message.trim().length === 0) return false

  return true
})

async function initiateSubmit() {
  if (!turnstile || !widgetId) return

  pending = true
  if (N25_PUBLIC_DEPLOYMENT_ENV !== 'production') {
    finishSubmit('')
  } else {
    turnstile.execute(widgetId)
  }
}

async function finishSubmit(turnstileToken: string) {
  try {
    turnstile?.reset(widgetId!)
    const result = await submitPost({ nickname, content: message, turnstileToken })

    if (!result.success) {
      toast.error(result.error ?? 'Failed to submit your message. Please try again later.')
    } else {
      postDialogOpen = false
      message = ''
      if (result.crisisResources) {
        toast('You are not alone.', {
          description: `Help is available. If you want to talk to someone, call 988 or text HOME to 741741.`,
          duration: 15000,
          icon: Heart as unknown as Component, // lucide types are broken
        })
      } else {
        toast.success('Thank you.')
      }

      transientTarget.dispatchEvent(new CustomEvent('transient'))
    }
  } catch (e) {
    console.error(e)
    toast.error('An unexpected error occurred. Please try again later.')
  } finally {
    pending = false
  }
}

let hovered: boolean = $state(false)
let hoverIx: number = $state(0)
let isTouch = $state(true)
let pointer = $state({ x: 0, y: 0 })

$effect(() => {
  if (!overlay) return

  if (pointer.x > 0.5 * clientWidth()) {
    overlay.style.right = `${clientWidth() - pointer.x}px`
    overlay.style.left = 'auto'
  } else {
    overlay.style.left = `${pointer.x}px`
    overlay.style.right = 'auto'
  }

  if (pointer.y > 0.95 * clientHeight()) {
    overlay.style.bottom = `${clientHeight() - pointer.y}px`
    overlay.style.top = 'auto'
  } else {
    overlay.style.top = `${pointer.y}px`
    overlay.style.bottom = 'auto'
  }
})

function handleMove(event: PointerEvent) {
  isTouch = event.pointerType === 'touch'
  pointer.x = event.pageX
  pointer.y = event.pageY
}

function handleHover(id: number, _frag: Fragment) {
  hovered = true
  hoverIx = id
}

function handleUnhover(_id: number, _frag: Fragment) {
  hovered = false
}

function handleClick(id: number, _frag: Fragment) {
  if (posts.length === 0) return
  viewing = posts[id % posts.length]
  viewDialogOpen = true
  recordView({ postId: viewing.id }).catch((e) => {
    console.error('Failed to record view:', e)
  })
}

let viewing: PostView | null = $state(null)
let viewDialogOpen = $state(false)
let postDialogOpen = $state(false)
let posts: PostView[] = $state([])

onMount(async () => {
  posts = await getPosts({ maxEntries: 300 })
})

function truncate(str: string, maxLength: number) {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

const transientTarget = new EventTarget()

let overlay: HTMLDivElement = $state(null!)
let submitButton: HTMLButtonElement = $state(null!)

let turnstileIsActive = $state(false)
const shouldShowTurnstile = $derived(turnstileIsActive && postDialogOpen)
</script>

<Fragments
  count={300}
  onpointermove={handleMove}
  onmouseenter={handleHover}
  onmouseleave={handleUnhover}
  onclick={handleClick}
  transient={(listener) => transientTarget.addEventListener('transient', listener)}
/>

<!-- Hover overlay -->
{#if posts.length > 0}
  {@const post = posts[hoverIx % posts.length]}
  <div
    bind:this={overlay}
    class="pointer-events-none fixed bg-black p-2 shadow-lg shadow-black/25 transition-opacity"
    style:opacity={hovered && !isTouch ? 1 : 0}
  >
    {#if post.nickname}
      <span class="font-semibold">{truncate(post.nickname, 30)}:</span>
    {/if}
    {truncate(post.content, 80)}
  </div>
{/if}

<div
  class="group pointer-events-none fixed right-0 bottom-0 flex size-48 items-end justify-end bg-linear-to-br from-transparent from-50% to-black/75 text-white transition-colors focus-within:to-black has-hover:to-black"
>
  <button
    class="pointer-events-auto m-0.5 rounded-full p-5.5 outline-white hover:cursor-pointer focus-visible:outline-2"
    onclick={() => (postDialogOpen = true)}><Plus class="size-12" /></button
  >
</div>

<!-- Message submission overlay -->
<Dialog.Root bind:open={postDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-40 bg-black/50 bg-radial from-black from-10% to-transparent data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      interactOutsideBehavior="ignore"
      class="dialog fixed top-[50%] left-[50%] z-40 flex max-w-full translate-x-[-50%] translate-y-[-50%] justify-center overflow-clip bg-black p-5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    >
      <div class="fixed top-2 right-3 text-sm opacity-50">
        2025 &copy; <a href="https://dayli.ly" class="underline hover:no-underline">daylily</a> |
        <a href="https://github.com/re-xyr/nightcord.at" class="underline hover:no-underline"
          >open source</a
        >
      </div>

      <div class="relative flex w-dvw max-w-2xl flex-col gap-4">
        <PenTool
          class="absolute -top-12 -left-4 inline-block size-32 -scale-x-100 rotate-180 opacity-10"
        />

        <Dialog.Title class="grow text-3xl">Leave a message</Dialog.Title>

        <input
          bind:value={nickname}
          type="text"
          placeholder="A name (optional)"
          class="border-b border-white/50 p-1 outline-0 focus:border-white focus:bg-white/5"
        />

        <textarea
          bind:value={message}
          placeholder="Your message..."
          class="h-24 border-b border-white/50 p-1 outline-0 transition-colors focus:border-white focus:bg-white/5"
        ></textarea>

        <div class="flex flex-col sm:flex-row sm:items-center">
          <Dialog.Close
            class="flex h-8 min-w-42 flex-row items-center justify-start gap-2 border-b border-transparent bg-linear-to-l from-transparent from-0% to-stone-600 to-50% font-medium text-fg transition-colors hover:to-stone-700 not-disabled:hover:cursor-pointer focus-visible:border-white focus-visible:outline-0 disabled:opacity-50"
          >
            <div class="flex size-8 items-center justify-center bg-black/25">
              <Undo2 class="size-4" />
            </div>

            <div>Nevermind</div>
          </Dialog.Close>

          <button
            bind:this={submitButton}
            onclick={initiateSubmit}
            disabled={!submittable}
            class="flex h-8 grow flex-row items-center justify-end gap-2 border-b border-transparent bg-linear-to-r from-transparent from-0% to-accent to-50% font-medium text-fg transition-opacity not-disabled:hover:cursor-pointer focus-visible:border-white focus-visible:outline-0 disabled:opacity-50"
          >
            <div>
              {#if pending}
                Loading...
              {:else if submittable}
                Submit
              {:else}
                Enter something?
              {/if}
            </div>

            <div class="flex size-8 items-center justify-center bg-black/25">
              {#if pending}
                <LoaderCircle class="animate-spin" />
              {:else if submittable}
                <ArrowRight />
              {:else}
                <Ellipsis />
              {/if}
            </div>
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Popover.Root open={shouldShowTurnstile}>
  <Popover.Content
    forceMount
    interactOutsideBehavior="ignore"
    escapeKeydownBehavior="ignore"
    customAnchor={submitButton}
    class={cn(
      'z-50 m-7 rounded bg-black px-2 pt-2 pb-1 text-white shadow-lg shadow-white/5 transition-opacity',
      shouldShowTurnstile ? 'opacity-100' : 'pointer-events-none opacity-0',
    )}
  >
    <Turnstile
      siteKey={N25_PUBLIC_CF_TURNSTILE_SITEKEY}
      appearance="always"
      execution="execute"
      theme="dark"
      bind:turnstile
      bind:widgetId
      on:callback={(e) => finishSubmit(e.detail.token)}
      on:before-interactive={() => (turnstileIsActive = true)}
      on:after-interactive={() => (turnstileIsActive = false)}
    />
  </Popover.Content>
</Popover.Root>

<Dialog.Root bind:open={viewDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 bg-radial from-black from-10% to-transparent data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="dialog fixed top-[50%] left-[50%] z-50 flex max-w-full translate-x-[-50%] translate-y-[-50%] items-center justify-center overflow-clip bg-black p-5 shadow-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      style="--tw-shadow-color: {toCssString(blackbodyColor(-(viewing?.inferredSentiment ?? 0)))}"
    >
      <div class="relative flex w-dvw max-w-2xl flex-col gap-4">
        <Quote class="absolute -top-10 -left-4 inline-block size-32 fill-fg opacity-10" />

        {#if viewing}
          <code
            class="absolute -top-2 -right-2 pl-0.5 text-xs tracking-widest opacity-33"
            role="presentation">{viewing.inferredSentiment.toFixed(16)}</code
          >

          <Dialog.Title class="grow text-3xl">
            {#if viewing.nickname}
              <span class="font-semibold">{viewing.nickname}</span>
            {:else}
              <i>An anonymous {randomSelect(['voice', 'wanderer', 'traveler'])}</i>
            {/if}
            said:
          </Dialog.Title>

          <p class="text-lg whitespace-pre-line">{viewing.content}</p>

          <div
            class="flex flex-row flex-wrap items-center justify-end gap-1 text-end text-sm font-medium opacity-75"
          >
            <span>{viewing.createdAt.toLocaleString()}</span>
            <span>in {viewing.authorCity}, {viewing.authorRegion}, {viewing.authorCountry}</span>
            <div class="flex flex-row items-center gap-1">
              <span
                class="contents"
                title="Number of times this message has been viewed (expanded)"
              >
                ‧ {viewing.views}
                <Eye class="size-4" />
              </span>
              <span class="contents" title="Number of times this message has been loaded">
                ‧ {viewing.loads}
                <RefreshCcw class="size-3.5" />
              </span>
            </div>
            {#if viewing.inferredSelfHarmIntent}
              <div class="text-end align-middle text-sm font-medium opacity-75">
                <Heart class="inline size-3" /> You are not alone; help is available. If you want to talk
                to someone, call 988 or text HOME to 741741.
              </div>
            {/if}
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:items-center">
            <Dialog.Close
              onclick={() => (viewDialogOpen = false)}
              class="flex h-8 grow flex-row items-center justify-end gap-2 border-b border-transparent bg-linear-to-r from-transparent from-0% to-accent to-50% font-medium text-fg outline-fg transition-opacity hover:opacity-80 not-disabled:hover:cursor-pointer focus-visible:border-white focus-visible:outline-0 disabled:opacity-50"
            >
              <div>Move on</div>

              <div class="flex size-8 items-center justify-center bg-black/25">
                <ArrowRight />
              </div>
            </Dialog.Close>
          </div>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
