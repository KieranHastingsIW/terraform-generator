import ProfileConfiguratorForm from '@/components/profile-configurator-form';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 bg-background">
      <ProfileConfiguratorForm />
    </main>
  );
}
