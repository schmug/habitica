<template>
  <tr v-if="aiEnabledOnServer">
    <td class="settings-label">
      {{ $t('aiFeaturesEnable') }}
    </td>
    <td class="settings-value small-text">
      {{ $t('aiFeaturesPop') }}
    </td>
    <td class="settings-button">
      <toggle-switch
        v-model="aiEnabled"
        @change="saveAiEnabled"
      />
    </td>
  </tr>
</template>

<style lang="scss" scoped>
::v-deep {
  .toggle-switch-outer {
    display: inline-block;
  }
}
</style>

<script>
import { mapState } from '@/libs/store';
import ToggleSwitch from '@/components/ui/toggleSwitch.vue';

const AI_ENABLED = import.meta.env.AI_ENABLED === 'true';

export default {
  components: { ToggleSwitch },
  data () {
    return {
      aiEnabledOnServer: AI_ENABLED,
    };
  },
  computed: {
    ...mapState({
      user: 'user.data',
    }),
    aiEnabled: {
      get () {
        return Boolean(this.user.preferences.ai && this.user.preferences.ai.enabled);
      },
      set (value) {
        if (!this.user.preferences.ai) this.$set(this.user.preferences, 'ai', {});
        this.$set(this.user.preferences.ai, 'enabled', value);
      },
    },
  },
  methods: {
    saveAiEnabled (enabled) {
      return this.$store.dispatch('user:set', {
        'preferences.ai.enabled': Boolean(enabled),
      });
    },
  },
};
</script>
