import { createFileRoute, useParams } from "@tanstack/react-router";
import TopBar from "@/components/layout/TopBar";
import ProfileView from "@/components/profile/ProfileView";

export const Route = createFileRoute("/_app/profile/$id")({
  head: () => ({ meta: [{ title: "PURRE PETS — profil" }] }),
  component: PublicProfilePage,
});

/** Profil publiczny = ten sam wspólny komponent co profil własny (PROFIL ULTRA). */
function PublicProfilePage() {
  const { id } = useParams({ from: "/_app/profile/$id" });
  return (
    <div>
      <TopBar />
      <div className="px-4 pb-12 pt-6 lg:px-8">
        <ProfileView profileId={id} />
      </div>
    </div>
  );
}
