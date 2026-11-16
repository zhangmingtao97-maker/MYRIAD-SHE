/** Keep the native custom-tab host in sync when a tab is shown or recreated. */
export function syncActiveTab(page: unknown, selected: 0 | 1 | 2) {
  const host = page as { getTabBar?: () => { setData: (data: { selected: number }) => void } | undefined };
  host.getTabBar?.()?.setData({ selected });
}
