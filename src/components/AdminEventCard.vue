<template>
  <div v-if="event">
    <h3>
      {{ event.title || 'Untitled Event' }} ({{ formatDateTime(event) }}) Attendance:
      {{ Number.isInteger(event.attendance) ? event.attendance : "Loading" }}
    </h3>
    <router-link v-if="canEdit && event.id" :to="'/admin/events/' + event.id"
      ><button>Edit Event</button></router-link
    >
    <button
      v-if="canDelete && event.id"
      @click="() => deleteEvent(event.id)"
      class="remove"
    >
      Delete Event
    </button>
    <button v-if="event.id" @click="() => openQrCode(event.id)">View Event QR Code</button>
  </div>
  <div v-else>
    <h3>Loading event...</h3>
  </div>
</template>
<script>
import { db, functions, auth } from "../firebase";
import QRCode from "qrcode";
import { getFormatDateTime, getUserPerms } from "../helpers";

export default {
  name: "AdminEventCard",

  components: {},

  props: {
    event: {
      type: Object,
      required: true,
      default: () => null,
      validator: (value) => {
        // Allow null during loading, but if provided, should have basic structure
        return value === null || (typeof value === 'object' && value !== null);
      }
    },
  },

  async mounted() {
    // Only proceed if event exists and has an id
    if (this.event && this.event.id) {
      await this.fetchEventAttendance(this.event.id);
    }
    
    auth.onAuthStateChanged(async (user) => {
      if (user && this.event) {
        const perms = await getUserPerms(user);
        this.canEdit =
          perms.otherEditEvent ||
          (perms.editMyEvent && this.event.createdBy == user.uid) ||
          (perms.acmEditEvent && this.event.tags?.includes("acm")) ||
          (perms.acmwEditEvent && this.event.tags?.includes("acmw")) ||
          (perms.broncosecEditEvent && this.event.tags?.includes("broncosec")) ||
          (perms.otherEditEvent && this.event.tags?.includes("other")) ||
          (perms.icpcEditEvent && this.event.tags?.includes("icpc"));
        this.canDelete =
          perms.otherDeleteEvent ||
          (perms.deleteMyEvent && this.event.createdBy == user.uid) ||
          (perms.acmDeleteEvent && this.event.tags?.includes("acm")) ||
          (perms.acmwDeleteEvent && this.event.tags?.includes("acmw")) ||
          (perms.broncosecDeleteEvent && this.event.tags?.includes("broncosec")) ||
          (perms.otherDeleteEvent && this.event.tags?.includes("other")) ||
          (perms.icpcEditEvent && this.event.tags?.includes("icpc"));
      }
    });
  },

  methods: { 
    async deleteEvent(id) {
      if (confirm("Are you sure you want to delete this event?") == true) {
        await db.collection("events").doc(id).delete();
        alert("deleted");
      }
    },
    async fetchEventAttendance(eventId) {
      // Validate eventId parameter
      if (!eventId) {
        console.warn('fetchEventAttendance called without valid eventId');
        return;
      }
      
      try {
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (eventDoc.exists) {
          this.attendance = eventDoc.data().attendance;
        }
      } catch (error) {
        console.error('Error fetching event attendance:', error);
      }
    },
    async openQrCode(id) {
      const url = window.location.origin + "/register/" + id;
      const imageSrc = await QRCode.toDataURL(url, { width: 512 });
      const contentType = "image/png";
      const byteCharacters = atob(
        imageSrc.substr(`data:${contentType};base64,`.length)
      );
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
        const slice = byteCharacters.slice(offset, offset + 1024);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);

        byteArrays.push(byteArray);
      }
      const blob = new Blob(byteArrays, { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      
      window.open(blobUrl, "_blank");
    },
    formatDateTime(event) {
      if (!event) {
        return 'No date available';
      }
      return getFormatDateTime(event);
    },
    async fetchAdditionalData() {
      if (!this.event || !this.event.id) {
        console.warn('fetchAdditionalData called without valid event');
        return;
      }
      
      try {
        const result = await functions.httpsCallable("someFunction")({
          id: this.event.id,
        });
        console.log(result.data);
      } catch (error) {
        console.error('Error fetching additional data:', error);
      }
    },
  },
  

  data: () => ({
    attendance: null,
    canEdit: false,
    canDelete: false,
  }),
};
</script>

<style scoped>
.uid-input {
  display: inline-block;
  width: 300px;
}

.event {
  margin-top: 10px;
  font-size: 18px;
  text-decoration: none;
}

span {
  font-size: 18px;
}

button {
  border-radius: 40px;
  padding: 10px 30px;
  margin-bottom: 15px;
  border: 2px solid #1c548d;
  margin: 0px 10px 20px 10px;
  color: black;
}
button.remove {
  border: 2px solid #eb4034;
  margin-right: 20px;
}

button.create {
  background-color: #1c548d;
  color: white;
}

h2 {
  margin-top: 20px;
}
</style>
